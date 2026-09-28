// 01–02 storyboard lens (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.4), pure node:
// every 01–02 phase has a look and nothing outside does; the curves give the storyboard's start values
// (SB02 aberration/radial blur, SB03 blood corners/near DOF/mud, SB04 flash on the butt hit, SB04A
// desaturated blood 0.3); the driver crossfades and drops to null the moment 01–02 ends; a null lens
// leaves Script_Main's post parameters untouched; the wiring in Main / Runtime / Composite / HUD is there.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Evaluate, EvaluateLook, OpeningLensDriver, ApplyLensToPost, BlendLens, SampleKeys, LookForPhase, EVENT_WAITS } from "./Script_OpeningLens.mjs";
import { LENS_DEFAULT, LOOKS, PHASE_LOOKS, LENS_MUD_TEXTURE, SHELL_FLIGHT_S } from "./Data_OpeningLens.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Read = f => fs.readFileSync(path.join(here, f), "utf8");
const Near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
let checks = 0;
const Check = (name, fn) => { fn(); checks += 1; console.log(`ok ${name}`); };

Check("every 01–02 phase has a look, nothing else does", () => {
  const inside = [...C.phases.Trapped, ...C.phases.BunkerRescue, "Released"];
  for (const phase of inside) {
    assert.ok(PHASE_LOOKS[phase], `phase ${phase} has no look`);
    assert.ok(LOOKS[PHASE_LOOKS[phase]], `phase ${phase} → unknown look ${PHASE_LOOKS[phase]}`);
    assert.ok(Evaluate(phase, 0, {}), `phase ${phase} evaluates`);
  }
  for (const phase of [...(C.phases.RearTrench || []), null, undefined, "", "Support", "MachineGun"])
    assert.equal(Evaluate(phase, 1, { now: 5, blastAt: 1 }), null, `phase ${phase} must be null`);
  assert.throws(() => EvaluateLook("noSuchLook"), /unknown look/);
});

Check("keys interpolate and hold at both ends", () => {
  const k = [[1, 0], [2, 10]];
  assert.equal(SampleKeys(k, 0), 0); assert.equal(SampleKeys(k, 1.5), 5); assert.equal(SampleKeys(k, 9), 10);
});

Check("SB02 near miss: aberration ~0.02 decaying over 1.5 s, radial blur, heavier vignette", () => {
  const At = t => Evaluate("Blast", t, { now: 100 + t, blastAt: 100 });
  assert.equal(At(0.1).aberration, LENS_DEFAULT.aberration, "no kick before the shell lands (flight 0.22 s)");
  Near(At(0.28).aberration, 0.02, 0.0005, "aberration peak");
  assert.ok(At(1.0).aberration > 0.008, "still strong mid-decay");
  Near(At(0.22 + 1.5).aberration, LENS_DEFAULT.aberration, 1e-6, "back after 1.5 s");
  assert.ok(At(0.3).radialBlur >= 0.05, "radial blur on impact");
  assert.ok(At(0.9).radialBlur > 0.02, "radial blur through the storyboard frame (0.22–0.95 s)");
  assert.equal(At(2.0).radialBlur, 0);
  assert.ok(At(0.35).vignette >= 0.75, "vignette heavier");
  const black = Evaluate("Black", 0.4, { now: 101.2, blastAt: 100 });
  assert.equal(black.look, "nearMiss", "Black carries the near-miss curve on the blast clock");
  // The director may hand the landing itself (impactAt); the curve then follows it, not blastAt + flight.
  Near(Evaluate("Blast", 0.5, { now: 100.5, blastAt: 100, impactAt: 100.44 }).aberration, 0.02, 0.0005, "peak 0.06 s after impactAt");
  assert.equal(Evaluate("Blast", 0.3, { now: 100.3, blastAt: 100, impactAt: 100.4 }).aberration, LENS_DEFAULT.aberration, "nothing before impactAt");
});

Check("the fallback shell flight is the director's FireShell flight", () => {
  const source = Read("Script_OpeningStoryboards.mjs");
  const blast = source.slice(source.indexOf("  Blast(){"), source.indexOf("\n  }", source.indexOf("  Blast(){")));
  // The flight is a literal or read from the storyboard data (b = C.banter inside Blast()).
  const raw = /FireShell\(.*?\{[^}]*flight:\s*([\d.]+|b\.blastShot\.fallStartS)\b/.exec(blast)?.[1];
  if (raw?.startsWith("b.")) assert.match(blast, /\bb\s*=\s*C\.banter\b/, "Blast() reads the flight from C.banter");
  const flight = raw?.startsWith("b.") ? C.banter.blastShot.fallStartS : Number(raw);
  assert.ok(Number.isFinite(flight), "Blast() fires the near miss with a flight time");
  assert.equal(SHELL_FLIGHT_S, flight, "Data_OpeningLens.SHELL_FLIGHT_S matches the director's flight (or hand events.impactAt)");
});

Check("a look stuck waiting for its event warns once (renamed / retimed director fields)", () => {
  const warn = console.warn, seen = []; console.warn = m => seen.push(String(m));
  try {
    const d = new OpeningLensDriver();
    for (const [phase, [event, after]] of Object.entries(EVENT_WAITS)) {
      d.Sample(1000 + after - 0.5, phase, after - 0.5, {});
      assert.ok(!seen.some(m => m.includes(`${phase} has run`)), `${phase}: no warning before ${after} s`);
      d.Sample(1000 + after + 0.5, phase, after + 0.5, {}); d.Sample(1000 + after + 1, phase, after + 1, {});
      assert.equal(seen.filter(m => m.includes(`${phase} has run`) && m.includes(event)).length, 1, `${phase}: one warning naming ${event}`);
    }
    const ok = new OpeningLensDriver();
    ok.Sample(50, "Blast", 20, { blastAt: 40 });
    assert.equal(ok.warnings.length, 0, "no warning once the event has come");
  } finally { console.warn = warn; }
});

Check("witness (Wake → Taunt, first person from the pinned eye): blood corners 0.3 with the concussion, near DOF at 2.8 m, mud", () => {
  const full = Evaluate("FrontPass", 3, { concussion: 0.8 });
  Near(full.bloodEdge.strength, 0.3, 1e-9, "blood edge");
  const [tl, tr, bl, br] = full.bloodEdge.corners;
  assert.ok(tr >= 0.95 && tl >= 0.8 && bl >= 0.8 && br < 0.5, "upper right and left heavier, lower right light");
  assert.ok(full.bloodEdge.tint[0] > full.bloodEdge.tint[1] * 4, "red tint");
  Near(Evaluate("Wake", 0.5, { concussion: 0.25 }).bloodEdge.strength, 0.15, 1e-9, "fades in with the concussion");
  assert.equal(full.dofNear.focusM, 2.8, "focus on the group 2.3-4.2 m off");
  assert.ok(full.dofNear.focusM - full.dofNear.rangeM <= 1.0 + 1e-9, "the mud right in front inside the soft range");
  assert.ok(full.mud >= 0.5 && full.mud <= 0.7, "mud, light enough for the throat cut to read");
  // 2026-09-27: no cut-away camera; the questioning and the cut are seen through the same lens.
  for (const phase of ["Wake", "FrontPass", "CaptiveDragged", "CaptiveWall", "Interrogation", "Slash", "Taunt"])
    assert.equal(Evaluate(phase, 1).look, "witness", phase);
  assert.ok(!("cinematic" in LOOKS), "the cut-away look is gone");
});

Check("the slap: the struck side swims for 2.4 s, the aberration kicks, the side follows the blow", () => {
  const at = t => Evaluate("Ask", 3, { now: 30 + t, slapAt: 30, slapSide: 1 });
  assert.equal(Evaluate("Hold", 1, { now: 10 }).slap.amount, 0, "nothing before the first slap");
  assert.ok(at(0.05).slap.amount >= 0.95, "full on the blow");
  assert.equal(at(0.05).slap.side, 1, "struck on the left cheek: the left of the frame");
  assert.ok(at(1).slap.amount > 0.3 && at(1).slap.amount < 0.9, "easing off");
  assert.equal(at(2.5).slap.amount, 0, "gone after 2.4 s");
  assert.equal(Evaluate("Ask", 3, { now: 31, slapAt: 30, slapSide: -1 }).slap.side, -1, "backhand: the right of the frame");
  assert.ok(at(0.05).aberration > 0.01, "aberration kick");
  assert.ok(Evaluate("Charge", 0.5, { now: 30.5, slapAt: 30, slapSide: 1 }).slap.amount > 0, "the last slap's daze carries into the charge");
  const post = ApplyLensToPost({ vignette: 0.42 }, at(0.05));
  assert.equal(post.sideDaze.side, 1); assert.ok(post.sideDaze.amount > 0.9, "handed to the composite");
  assert.equal(ApplyLensToPost({ vignette: 0.42 }, at(3)).sideDaze, null, "no daze: no parameter");
});

Check("found / held nearly clean; Lift, Check, KickRifle, Released clean", () => {
  const found = Evaluate("Found", 1);
  assert.ok(found.mud > 0 && found.bloodEdge.strength <= 0.3, "found: still muddy");
  for (const phase of ["Hold", "Ask"]) {
    const held = Evaluate(phase, 1, { now: 99 });
    assert.ok(held.bloodEdge.strength <= 0.1 && held.radialBlur === 0 && held.flash === 0 && held.mud === 0, phase);
    assert.ok(held.storyBloodCap <= 0.5, `${phase}: the split lip's blood layer capped`);
  }
  for (const phase of ["Lift", "Check", "KickRifle", "Released", "Banter", "Orders", "Incoming"]) {
    const lens = Evaluate(phase, 1, { now: 99, blastAt: 98.8 });
    const { look, ...rest } = lens;
    assert.deepEqual(rest, { ...JSON.parse(JSON.stringify(LENS_DEFAULT)), slap: { side: 1, amount: 0 } }, `${phase} is clean`);
  }
  for (const phase of C.phases.Trapped.concat(C.phases.BunkerRescue)) assert.ok(PHASE_LOOKS[phase], `${phase} has a look`);
});

Check("driver: crossfade between looks, idempotent per frame, null the moment 01–02 ends", () => {
  const d = new OpeningLensDriver();
  const blast = d.Sample(10.3, "Blast", 0.3, { blastAt: 10, concussion: 1 });
  assert.equal(blast.look, "nearMiss");
  assert.equal(d.Sample(10.3, "Blast", 0.3, { blastAt: 10 }), blast, "same frame, same object");
  d.Sample(11.95, "Black", 1.6, { blastAt: 10, concussion: 1 });
  const w0 = d.Sample(12, "Wake", 0, { blastAt: 10, concussion: 1 });
  assert.ok(w0.bloodEdge.strength < 0.02 && w0.mud < 0.05, "Wake starts from what was on screen");
  const w1 = d.Sample(13.1, "Wake", 1.1, { blastAt: 10, concussion: 1 });
  assert.ok(w1.bloodEdge.strength > 0.1 && w1.bloodEdge.strength < 0.3, "fading in");
  const w2 = d.Sample(14.5, "Wake", 2.5, { blastAt: 10, concussion: 1 });
  Near(w2.bloodEdge.strength, 0.3, 1e-9, "settled");
  assert.equal(d.Sample(14.6, null, 0, {}), null, "leaving 01–02: null at once");
  assert.equal(d.Sample(14.7, "Withdraw", 0, {}), null, "02→03 phases are outside");
  const again = d.Sample(20, "Hold", 0, {});
  assert.equal(again.look, "held"); Near(again.bloodEdge.strength, 0.1, 1e-9, "no stale blend from before the gap");
  // A snapshot older than a frame or two (frames stepped without rendering) is not a crossfade source.
  const s = new OpeningLensDriver();
  s.Sample(1.0, "Blast", 0.3, { blastAt: 0.7 });
  const late = s.Sample(9.0, "FrontPass", 2, { blastAt: 0.7, concussion: 1 });
  Near(late.bloodEdge.strength, 0.3, 1e-9, "stale snapshot ignored"); Near(late.aberration, 0.0035, 1e-9, "no near-miss residue");
});

Check("debug bench: Force(look, age) holds a look, Clear() returns to the phase", () => {
  globalThis.Tengxian = { Debug: {} };
  const d = new OpeningLensDriver(), D = globalThis.Tengxian.Debug.OpeningLens;
  assert.ok(D && D.Force && D.Clear && D.State && D.Looks().includes("nearMiss"));
  D.Force("held", 0.04);
  const forced = d.Sample(1, null, 0, {});
  assert.equal(forced.look, "held"); assert.ok(forced.slap.amount >= 0.9); assert.ok(forced.forced);
  D.Force("nearMiss", 0.3);
  Near(d.Sample(2, null, 0, {}).aberration, 0.02, 0.001, "forced near miss at 0.3 s");
  assert.throws(() => D.Force("nope"), /unknown look/);
  D.Clear();
  assert.equal(d.Sample(3, null, 0, {}), null);
  D.Enable(false);
  assert.equal(d.Sample(4, "Wake", 1, {}), null, "Enable(false): lens off inside 01–02 (A/B bench)");
  D.Enable(true);
  assert.equal(d.Sample(5, "Wake", 1, {}).look, "witness");
  delete globalThis.Tengxian;
});

Check("ApplyLensToPost: null leaves every parameter untouched; a lens lays over the right ones", () => {
  const Base = () => ({ exposure: 1.1, saturation: 0.9, vignette: 0.42 * 0.8, aberration: undefined, damage: 0.1,
    dofStrength: 0, dofFocus: 1.5, dofRange: 2.8, dofMaxPx: 11, nearDofStrength: 0, nearDofFocus: 1.6,
    nearDofRange: 0.85, nearDofMaxPx: 4.5, nearDofSightUv: null });
  const base = Base(), out = ApplyLensToPost(base, null);
  assert.equal(out, base); assert.deepEqual(out, Base(), "null lens: identical parameters");
  assert.ok(!("radialBlur" in out) && !("bloodEdge" in out), "no lens keys added");
  const witness = ApplyLensToPost(Base(), Evaluate("Wake", 1, { concussion: 1 }));
  assert.equal(witness.nearDofStrength, 0.45); assert.equal(witness.nearDofFocus, 2.8); assert.equal(witness.nearDofMaxPx, 9);
  Near(witness.vignette, 0.52 * 0.8, 1e-9, "vignette keeps the graphics scale");
  assert.equal(witness.bloodEdge.strength, 0.3);
  const found = ApplyLensToPost(Base(), Evaluate("Found", 1, { concussion: 1 }));
  assert.ok(found.exposure < 1.1 && found.saturation < 0.9, "darken and desaturate scale the caller's values");
  const dying = ApplyLensToPost({ ...Base(), dofStrength: 1 }, Evaluate("Wake", 1));
  assert.equal(dying.dofStrength, 1, "death DOF wins over the lens far DOF");
  const blast = ApplyLensToPost(Base(), Evaluate("Blast", 0.3, { now: 0.3, blastAt: 0 }));
  assert.ok(blast.radialBlur > 0.04 && blast.aberration > 0.015);
  const mix = BlendLens(Evaluate("Hold", 0), Evaluate("Wake", 0, { concussion: 1 }), 0.5);
  Near(mix.bloodEdge.strength, (0.1 + 0.3) / 2, 1e-9, "blend");
});

Check("wiring: Main, Runtime, Composite and HUD use the lens; no new pass or sampler", () => {
  const main = Read("Script_Main.mjs"), runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  const composite = Read("Script_PostComposite.mjs"), hud = Read("Script_Hud.mjs"), css = Read("Style_Game.css");
  assert.match(main, /const openingLens = missionRuntime\?\.Perception\(\)\.lens \|\| null;/);
  assert.match(main, /hud\.SetLens\(openingLens\)/, "a direct call: a renamed HUD method fails loudly");
  assert.match(main, /post\.Render\(scene, camera, ApplyLensToPost\(\{[\s\S]*?\}, openingLens\)\);/);
  assert.match(runtime, /lens: this\.OpeningLens\(\)/);
  assert.match(runtime, /live \? show\.phase : null/);
  for (const u of ["uRadialBlur", "uBloodEdge", "uBloodCorners", "uSideDaze"]) {
    assert.match(composite, new RegExp(`uniform vec4 ${u};|uniform float ${u};|uniform vec2 ${u};`), `${u} declared`);
    assert.ok(!new RegExp(`sampler2D\\s+${u}`).test(composite));
  }
  const segmentAt = composite.indexOf("vec3 MotionBlur(");
  const concussionSegment = composite.slice(segmentAt, composite.indexOf("SEGMENT depth-of-field", segmentAt));
  assert.match(concussionSegment, /uRadialBlur/, "radial blur lives in the existing concussion taps");
  assert.equal((concussionSegment.match(/texture2D\(/g) || []).length, 13, "tap count unchanged (3 aberration + 9 concussion + 1 ghost)");
  assert.match(hud, /SetLens\(lens\)/);
  assert.match(hud, /amount=Math\.min\(amount,this\.storyBloodCap\?\?1\)/, "story blood cap applied in SetStoryBlood");
  assert.match(css, /:not\(\.hudLensMud\):not\(\.hudLensFlash\)/, "lens layers survive the cinematic-beat HUD hide");
  const data = Read("Data_OpeningLens.mjs");
  assert.ok(!/from\s+["']three["']/.test(data), "Data_OpeningLens has no three");
  const html = Read("index.html");
  for (const m of ["Script_OpeningLens.mjs", "Data_OpeningLens.mjs"]) assert.match(html, new RegExp(`"\\./${m}": "\\./${m}\\?v=\\d+"`), `${m} in the import map`);
});

Check("mud texture: RGBA webp, 16:9, within the texture budget", () => {
  const file = path.join(here, LENS_MUD_TEXTURE.replace(/^\.\//, "").replace(/\?.*$/, ""));
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString("ascii", 0, 4), "RIFF"); assert.equal(buf.toString("ascii", 8, 12), "WEBP");
  assert.equal(buf.toString("ascii", 12, 16), "VP8X", "extended webp (alpha)");
  assert.ok(buf[20] & 0x10, "alpha flag");
  const w = 1 + buf.readUIntLE(24, 3), h = 1 + buf.readUIntLE(27, 3);
  Near(w / h, 16 / 9, 0.01, "16:9"); assert.ok(w * h * 4 <= 4 * 1024 * 1024, `decoded ${w}x${h} within 4 MB`);
  assert.ok(buf.length < 400 * 1024, "file under 400 KB");
});

console.log(`OpeningLensTest: ${checks} checks passed`);
