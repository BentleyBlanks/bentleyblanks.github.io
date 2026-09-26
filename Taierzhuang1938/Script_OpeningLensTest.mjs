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
  const flight = Number(/FireShell\(.*?\{[^}]*flight:\s*([\d.]+)/.exec(blast)?.[1]);
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
    ok.Sample(50, "Butt", 20, { buttHit: 40 }); ok.Sample(51, "Found", 30, { clearAt: 30 });
    assert.equal(ok.warnings.length, 0, "no warning once the event has come");
  } finally { console.warn = warn; }
});

Check("SB03 witness: blood corners 0.3 with the concussion, near DOF 0.5 at 3.8 m, mud", () => {
  const full = Evaluate("FrontPass", 3, { concussion: 0.8 });
  Near(full.bloodEdge.strength, 0.3, 1e-9, "blood edge");
  const [tl, tr, bl, br] = full.bloodEdge.corners;
  assert.ok(tr >= 0.95 && tl >= 0.8 && bl >= 0.8 && br < 0.5, "upper right and left heavier, lower right light");
  assert.ok(full.bloodEdge.tint[0] > full.bloodEdge.tint[1] * 4, "red tint");
  Near(Evaluate("Wake", 0.5, { concussion: 0.25 }).bloodEdge.strength, 0.15, 1e-9, "fades in with the concussion");
  assert.equal(full.dofNear.strength, 0.5); assert.equal(full.dofNear.focusM, 3.8);
  assert.ok(full.dofNear.focusM - full.dofNear.rangeM <= 1.0 + 1e-9, "foreground 0.3–1 m inside the soft range");
  assert.ok(full.mud >= 0.8, "mud Wake→Found");
  for (const phase of ["Wake", "FrontPass"])
    assert.equal(Evaluate(phase, 1).look, "witness", phase);
});

Check("the captive film cuts immediately to a clean lens", () => {
  const driver=new OpeningLensDriver();driver.Sample(1,"FrontPass",3,{concussion:1});
  const cut=driver.Sample(1.016,"CaptiveDragged",0,{concussion:1});
  for(const phase of ["CaptiveDragged","CaptiveWall","Interrogation","Slash","Taunt","Wipe"]){
    const lens=Evaluate(phase,3,{concussion:1});
    assert.equal(lens.look,"cinematic");assert.equal(lens.mud,0);assert.equal(lens.bloodEdge.strength,0);assert.equal(lens.radialBlur,0);
  }
  assert.equal(cut.mud,0);assert.equal(cut.bloodEdge.strength,0);
});

Check("SB03A reach: darker, red weaker than SB03, mud; Found's blink clears the mud", () => {
  const reach = Evaluate("Reach", 1, { concussion: 1 }), witness = Evaluate("Wake", 1, { concussion: 1 });
  assert.ok(reach.darken > 0.1, "darker");
  assert.ok(reach.bloodEdge.strength < witness.bloodEdge.strength && reach.bloodEdge.strength > 0, "weaker red");
  assert.ok(reach.mud >= 0.8, "mud");
  const found = t => Evaluate("Found", 3, { now: 50 + t, clearAt: 50 });
  assert.ok(Evaluate("Found", 1, { now: 10 }).mud >= 0.8, "mud until ijaA stops (no clearAt yet)");
  assert.ok(found(0.5).mud >= 0.8, "mud until the blink");
  assert.equal(found(1.3).mud, 0, "gone with the blink (clearAt + 0.95–1.25 s)");
  assert.equal(found(1.3).bloodEdge.strength, 0, "SB04 starts without a red edge");
});

Check("SB04 butt: 0.08 s white flash on the hit, no red edge (storyboard clean), director blood capped after", () => {
  const before = Evaluate("Butt", 1, { now: 20 });
  assert.equal(before.flash, 0); assert.equal(before.bloodEdge.strength, 0);
  assert.equal(Evaluate("Drag", 1).bloodEdge.strength, 0, "dragged out: no red edge");
  const hit = t => Evaluate("Butt", 2, { now: 30 + t, buttHit: 30 });
  assert.ok(hit(0).flash >= 0.9 && hit(0.08).flash >= 0.9, "white for 0.08 s");
  assert.ok(hit(0.14).flash < hit(0.08).flash && hit(0.14).flash > 0, "fast fall");
  assert.equal(hit(0.25).flash, 0);
  assert.equal(hit(0.5).bloodEdge.strength, 0, "no red edge of the lens's own after the hit");
  assert.equal(hit(0.05).storyBloodCap, 1, "the director's blood layer is not capped under the flash");
  Near(hit(0.5).storyBloodCap, 0.5, 1e-9, "then capped to 0.5");
  assert.ok(hit(0.02).aberration > 0.01, "aberration kick on the hit");
});

Check("SB04A boots: blood 0.3, desaturated; SB05 nearly clean; SB05A/SB06 clean", () => {
  const boots = Evaluate("Boots", 1);
  Near(boots.bloodEdge.strength, 0.3, 1e-9, "blood 0.3"); assert.ok(boots.desaturate >= 0.3, "desaturated");
  Near(boots.storyBloodCap, 0.3, 1e-9, "the director's blood layer capped to 0.3");
  assert.ok(Evaluate("Collar", 1).storyBloodCap <= 0.2, "SB05 nearly clean: blood layer capped");
  for (const phase of C.phases.BunkerRescue.slice(0, 5)) {
    const held = Evaluate(phase, 1);
    assert.ok(held.bloodEdge.strength <= 0.1 && held.radialBlur === 0 && held.flash === 0 && held.mud === 0, phase);
  }
  for (const phase of ["Chop", "Parry", "Flee", "DragCover", "LongShot", "Check", "KickRifle", "Released", "Banter", "Orders", "Incoming"]) {
    const lens = Evaluate(phase, 1, { now: 99, blastAt: 98.8, buttHit: 99 });
    const { look, ...rest } = lens;
    assert.deepEqual(rest, JSON.parse(JSON.stringify(LENS_DEFAULT)), `${phase} is clean`);
  }
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
  assert.equal(again.look, "held"); Near(again.bloodEdge.strength, 0.08, 1e-9, "no stale blend from before the gap");
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
  D.Force("butt", 0.04);
  const forced = d.Sample(1, null, 0, {});
  assert.equal(forced.look, "butt"); assert.ok(forced.flash >= 0.9); assert.ok(forced.forced);
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
  assert.equal(witness.nearDofStrength, 0.5); assert.equal(witness.nearDofFocus, 3.8); assert.equal(witness.nearDofMaxPx, 9);
  Near(witness.vignette, 0.52 * 0.8, 1e-9, "vignette keeps the graphics scale");
  assert.equal(witness.bloodEdge.strength, 0.3);
  const reach = ApplyLensToPost(Base(), Evaluate("Reach", 1, { concussion: 1 }));
  assert.ok(reach.exposure < 1.1 && reach.saturation < 0.9, "darken and desaturate scale the caller's values");
  const dying = ApplyLensToPost({ ...Base(), dofStrength: 1 }, Evaluate("Wake", 1));
  assert.equal(dying.dofStrength, 1, "death DOF wins over the lens far DOF");
  const blast = ApplyLensToPost(Base(), Evaluate("Blast", 0.3, { now: 0.3, blastAt: 0 }));
  assert.ok(blast.radialBlur > 0.04 && blast.aberration > 0.015);
  const mix = BlendLens(Evaluate("Hold", 0), Evaluate("Boots", 0), 0.5);
  Near(mix.bloodEdge.strength, (0.08 + 0.3) / 2, 1e-9, "blend");
});

Check("wiring: Main, Runtime, Composite and HUD use the lens; no new pass or sampler", () => {
  const main = Read("Script_Main.mjs"), runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  const composite = Read("Script_PostComposite.mjs"), hud = Read("Script_Hud.mjs"), css = Read("Style_Game.css");
  assert.match(main, /const openingLens = missionRuntime\?\.Perception\(\)\.lens \|\| null;/);
  assert.match(main, /hud\.SetLens\(openingLens\)/, "a direct call: a renamed HUD method fails loudly");
  assert.match(main, /post\.Render\(scene, camera, ApplyLensToPost\(\{[\s\S]*?\}, openingLens\)\);/);
  assert.match(runtime, /lens: this\.OpeningLens\(\)/);
  assert.match(runtime, /live \? show\.phase : null/);
  for (const u of ["uRadialBlur", "uBloodEdge", "uBloodCorners"]) {
    assert.match(composite, new RegExp(`uniform vec4 ${u};|uniform float ${u};`), `${u} declared`);
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
