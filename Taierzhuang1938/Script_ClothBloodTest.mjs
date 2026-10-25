// Behavioral gates for conservative two-sided absorption, drying and replay.
// The model runs without Three or a GPU; the companion browser test checks
// production materials, skinning and the actual cloth-range controls.
import assert from 'node:assert/strict';
import { ClothBloodModel } from './Script_ClothBloodModel.mjs';
import { CLOTH_BLOOD_CONTROLS, CLOTH_BLOOD_SIM } from './Data_Tuning_ClothBlood.mjs';

let checks = 0;
function Check(ok, label, detail = '') {
  checks++;
  assert.ok(ok, `${label}${detail ? `: ${detail}` : ''}`);
  console.log(`ok   ${label}`);
}
const Mass = state => state.front.pigmentMl + state.back.pigmentMl;
const Wet = state => state.front.wetMl + state.back.wetMl;
const Area = state => state.front.areaM2 + state.back.areaM2;
const Close = (a, b, epsilon = 1e-7) => Math.abs(a - b) < epsilon;
function Healthy(model, label) {
  const state = model.State();
  Check(Number.isFinite(state.timeS) && Number.isFinite(Mass(state)) && Number.isFinite(Wet(state)), `${label}: finite state`);
  for (const layer of model.layers) for (const key of ['mobile', 'bound', 'wet']) {
    Check(layer[key].every(value => Number.isFinite(value) && value >= -1e-10), `${label}: non-negative ${key}`);
  }
  Check(Close(Mass(state), state.injectedMl, Math.max(1e-6, state.injectedMl * 1e-8)), `${label}: pigment is conserved`, JSON.stringify(state));
  return state;
}

const evidence = {};
{
  const model = new ClothBloodModel({ width: 1.4, length: 1.9, profile: 'thin' });
  Check(Mass(model.State()) === 0 && Wet(model.State()) === 0, 'New cloth starts clean');
  model.Inject({ u: .5, v: .5, side: 1, amountMl: 12 });
  const initial = Healthy(model, 'injection');
  Check(Close(Mass(initial), 12), 'A single dose retains its actual volume');
  Check(initial.front.pigmentMl > 0 && initial.back.pigmentMl === 0, 'A front dose starts on the front');
  const centre = model.Sample(.5, .5, 1), remote = model.Sample(.05, .05, 1);
  Check(centre.coverage > remote.coverage && centre.wetness > remote.wetness, 'Fresh blood has a wet localized centre');
  model.Advance(5);
  const five = Healthy(model, 'five seconds');
  Check(Wet(five) > Wet(initial) * .5, 'Default blood does not dry out within five seconds');
  model.Advance(25);
  const spread = Healthy(model, 'post-feed spread');
  Check(Area(spread) > Area(initial), 'Capillary spread continues after a one-shot dose stops');
  Check(spread.back.pigmentMl > 0, 'Thin cloth transports blood through to its reverse');
  evidence.dose = { initial, five, spread };
}

{
  const rows = [];
  for (const profile of ['thin', 'towel', 'quilt']) {
    const model = new ClothBloodModel({ width: 1.4, length: 1.9, profile });
    model.Inject({ u: .5, v: .5, side: 1, amountMl: 24 }); model.Advance(30);
    const state = Healthy(model, profile); rows.push({ profile, state, backFraction: state.back.pigmentMl / Mass(state) });
  }
  Check(rows[0].backFraction > rows[1].backFraction && rows[1].backFraction > rows[2].backFraction,
    'Equal-sized thin cloth, towel and quilt retain distinctly ordered through-thickness absorption', JSON.stringify(rows));
  evidence.profiles = rows;
}

{
  const fast = new ClothBloodModel({ profile: 'towel', params: { drySeconds: 60 } });
  const slow = new ClothBloodModel({ profile: 'towel', params: { drySeconds: 1800 } });
  for (const model of [fast, slow]) { model.Inject({ amountMl: 16 }); model.Advance(120); }
  const a = Healthy(fast, 'fast drying'), b = Healthy(slow, 'slow drying');
  Check(Wet(a) < Wet(b) * .6, 'Drying time controls moisture independently');
  Check(Close(Mass(a), Mass(b)) && Mass(a) > 15.9, 'Drying never deletes the permanent stain');
  const before = fast.Sample(.5, .5, 1);
  fast.Inject({ u: .5, v: .5, amountMl: 6 });
  const after = fast.Sample(.5, .5, 1);
  Check(after.wetness > before.wetness && after.pigment > before.pigment, 'Fresh blood deepens and re-wets an old centre');
  evidence.drying = { fast: a, slow: b, rewet: { before, after } };
}

{
  const model = new ClothBloodModel({ profile: 'towel' });
  model.StartFeed({ u: .42, v: .46, side: 1, rateMlS: 1.5 }); model.Advance(8);
  model.StopFeed(); const stopped = Healthy(model, 'stopped feed'); model.Advance(20);
  const later = Healthy(model, 'residual wicking');
  Check(stopped.injectedMl > 10 && stopped.injectedMl < 14, 'Continuous feed respects its volume rate');
  Check(Close(later.injectedMl, stopped.injectedMl) && !later.feeding, 'Stop halts new volume immediately');
  Check(Area(later) > Area(stopped), 'Residual mobile blood still spreads after supply stops');
  evidence.feed = { stopped, later };
}

{
  const model = new ClothBloodModel({ profile: 'thin' });
  for (let i = 0; i < 20; i++) model.Inject({ u: .15 + (i % 5) * .16, v: .18 + Math.floor(i / 5) * .19, amountMl: 2 });
  model.Advance(10); const before = Healthy(model, 'twenty separate sources');
  Check(Close(Mass(before), 40), 'Many sources accumulate without a rotating wound slot erasing old blood');
  const oldest = model.Sample(.15, .18, 1).pigment;
  for (let i = 0; i < 8; i++) model.Inject({ u: .78, v: .75, amountMl: 3 });
  Check(Close(model.Sample(.15, .18, 1).pigment, oldest), 'A new distant source cannot replace an old stain');
  Healthy(model, 'overlapping sources');
  Check(model.Sample(.78, .75, 1).pigment > model.Sample(.15, .18, 1).pigment, 'Overlapping sources merge their retained blood');
  evidence.sources = model.State();
}

{
  const a = new ClothBloodModel({ profile: 'towel' }), b = new ClothBloodModel({ profile: 'towel' });
  for (const model of [a, b]) { model.Inject({ u: .37, v: .58, amountMl: 9 }); model.StartFeed({ u: .6, v: .46, rateMlS: .4 }); }
  a.Advance(12); for (let i = 0; i < 120; i++) b.Advance(.1);
  Check(a.State().hash === b.State().hash, 'Fixed simulation steps are independent of frame batching');
  a.StopFeed(); a.Advance(8); const end = a.State(), atlas = Uint8Array.from(a.TextureData());
  a.Seek(4); Check(a.State().timeS <= 4.001 && a.State().feeding, 'Rewind restores the historical feeding state');
  a.Seek(end.timeS);
  Check(a.State().hash === end.hash && Close(a.State().injectedMl, end.injectedMl), 'Seeking forward exactly reproduces the recorded stain');
  Check(Buffer.from(a.TextureData()).equals(Buffer.from(atlas)), 'Replay reproduces the packed front/back material input');
  a.Seek(4); a.Inject({ u: .2, v: .2, amountMl: 3 });
  Check(a.State().durationS <= 4.001 && a.State().hash !== end.hash, 'Editing a rewound state creates a new branch, discarding its old future');
  const old = b.State(), buffers = b.layers.map(layer => [...layer.mobile]);
  a.Clear(); const cleared = a.State();
  Check(Mass(cleared) === 0 && Wet(cleared) === 0 && !cleared.feeding && cleared.timeS === 0 && cleared.eventCount === 0,
    'Clear removes blood, supply and timeline');
  Check(b.State().hash === old.hash && b.layers.every((layer, i) => layer.mobile.every((value, j) => value === buffers[i][j])),
    'Clearing one sample cannot change another sample or its mutable arrays');
  evidence.replay = { end, cleared };
}

{
  const model = new ClothBloodModel({ profile: 'thin' });
  model.Inject({ u: 0, v: 0, side: -1, amountMl: 5 }); model.Advance(12);
  const state = Healthy(model, 'edge and reverse injection');
  Check(Close(Mass(state), 5) && state.back.pigmentMl > state.front.pigmentMl, 'Boundary and reverse-side doses conserve pigment without wrapping');
  Check(model.Sample(.99, .99, -1).pigment === 0, 'A corner dose does not wrap to the opposite corner');
  const previous = JSON.stringify(model.State().params);
  for (const key of ['amountMl', 'feedMlS', 'diffusion', 'permeation', 'wetReflect', 'ageS', 'drySeconds']) model.Set(key, NaN);
  model.Set('unknown', 1);
  Check(JSON.stringify(model.State().params) === previous, 'Invalid parameters leave the model untouched');
  for (const control of CLOTH_BLOOD_CONTROLS) {
    model.Set(control.key, control.min - 100);
    Check(model.State().params[control.key] === control.min, `${control.key}: lower bound is enforced`);
    model.Set(control.key, control.max + 100);
    Check(model.State().params[control.key] === control.max, `${control.key}: upper bound is enforced`);
  }
}

{
  const fresh = new ClothBloodModel({ profile: 'towel' }), aged = new ClothBloodModel({ profile: 'towel' });
  fresh.Inject({ amountMl: 15, ageS: 0 }); aged.Inject({ amountMl: 15, ageS: 900 });
  Check(Close(Mass(fresh.State()), Mass(aged.State())) && Wet(aged.State()) < Wet(fresh.State()) * .15,
    'Authoring an old stain preserves its blood amount while reducing wetness');
  Check(aged.State().timeS === 0, 'Initial blood age is independent of the playback clock');
  const a = aged.Sample(.5, .5, 1); aged.Inject({ amountMl: 4, ageS: 0 }); const b = aged.Sample(.5, .5, 1);
  Check(b.pigment > a.pigment && b.wetness > a.wetness, 'An old absorbed patch accepts fresh blood without replacing its history');
  const tiny = new ClothBloodModel({ width: .1, length: .1, params: { diffusion: 4, permeation: 4 } });
  tiny.Inject({ u: 0, v: 0, amountMl: 1 }); tiny.Advance(.3); Healthy(tiny, 'maximum transport on a small cloth');
}

{
  const model = new ClothBloodModel({ profile: 'towel' });
  model.Inject({ u: .2, v: .2, amountMl: 4 }); model.StartFeed({ u: .7, v: .7, rateMlS: .5 }); model.Advance(.2);
  let accepted = 0;
  while (accepted <= CLOTH_BLOOD_SIM.maxEvents && model.Set('wetReflect', (accepted % 11) / 10)) accepted++;
  const full = model.State(), oldPigment = model.Sample(.2, .2, 1).pigment;
  Check(full.capacityReached && full.eventCount <= CLOTH_BLOOD_SIM.maxEvents,
    'Full event history reports its bounded capacity explicitly');
  Check(model.Inject({ u: .9, v: .1, amountMl: 5 }) === false && model.Sample(.2, .2, 1).pigment === oldPigment,
    'An over-capacity edit is rejected without silently erasing an earlier stain');
  model.StopFeed();
  Check(!model.State().feeding, 'Stopping a running source remains possible at the event limit');
  const stoppedMass = model.State().injectedMl; model.Advance(.4);
  Check(Close(model.State().injectedMl, stoppedMass), 'The event limit cannot leave a source supplying blood indefinitely');
  const end = model.State(); model.Seek(end.timeS);
  Check(model.State().hash === end.hash && !model.State().feeding, 'The stop at capacity survives deterministic replay');
  model.Clear();
  Check(!model.State().capacityReached && model.Inject({ amountMl: 2 }), 'Clear releases event capacity for the next experiment');
  evidence.capacity = { accepted, full, end };
}

console.log(JSON.stringify({ profileBackFractions: evidence.profiles.map(row => ({ profile: row.profile, backFraction: row.backFraction })),
  dryWetMl: { fast: Wet(evidence.drying.fast), slow: Wet(evidence.drying.slow) }, capacity: evidence.capacity.full.eventCount }, null, 2));
console.log(`ClothBloodTest: ${checks} checks passed`);
