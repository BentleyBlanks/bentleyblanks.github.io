import assert from 'node:assert/strict';
import { FirstLevelP012Arrival } from './Script_FirstLevelP012Arrival.mjs';
import { P012_ARRIVAL } from './Data_FirstLevelP012Arrival.mjs';
import { FirstLevelP012ArrivalView } from './Script_FirstLevelP012ArrivalView.mjs';
let near = false, releases = 0, door = 0, starts = 0, stops = 0, cues = [], lines = [];
const arrival = new FirstLevelP012Arrival({
  NearDoor: () => near, GuideArrival: () => {}, SetDoorProgress: p => { door = p; },
  ReleaseColumn: () => { assert.equal(door, 1); releases++; },
  StartAudio: () => ++starts, StopAudio: () => stops++, PlaySfx: cue => cues.push(cue), Subtitle: line => lines.push(line),
});
assert.equal(arrival.Start(), true); assert.equal(arrival.Start(), false);
for (let n = 0; n < 280; n++) arrival.Update(.1);
assert.equal(arrival.phase, 'guide'); assert.equal(door, 0); assert.equal(releases, 0);
near = true; arrival.Update(.1); assert.equal(arrival.phase, 'door');
arrival.Update(.25); assert(door > 0 && door < 1); assert.equal(releases, 0);
let blackSeconds = 0;
for (let n = 0; n < 30; n++) { arrival.Update(.1); if (arrival.View().fade > 0) blackSeconds += .1; }
assert(blackSeconds > 0 && blackSeconds < 2); assert.equal(releases, 1);
assert.equal(stops, 0, 'audio survives black frame'); assert.equal(arrival.View().controlsLocked, false);
assert.deepEqual(cues, [P012_ARRIVAL.audio.brake, P012_ARRIVAL.audio.door]);
assert.equal(lines.length, P012_ARRIVAL.brakeBeats.length + 1); assert(lines.every(line => !/枪口|装弹|望远镜/.test(line)));
assert(P012_ARRIVAL.brakeSeconds >= 27 && P012_ARRIVAL.brakeSeconds <= 30);
assert.equal(P012_ARRIVAL.brakeBeats[0].second,0);
for(let i=1;i<P012_ARRIVAL.brakeBeats.length;i++)assert(P012_ARRIVAL.brakeBeats[i].second-P012_ARRIVAL.brakeBeats[i-1].second<=8,'no inert gap exceeds eight seconds');
assert(P012_ARRIVAL.brakeSeconds-P012_ARRIVAL.brakeBeats.at(-1).second<=8);
for (let n = 0; n < 100; n++) arrival.Update(.1);
assert.equal(stops, 1); assert.equal(releases, 1);
const snapshot = arrival.Snapshot(); arrival.Restore(snapshot); arrival.Restore(snapshot);
assert.equal(releases, 1); assert.equal(cues.length, 2); assert.equal(starts, 1);
arrival.Dispose(); arrival.Dispose(); assert.equal(stops, 1);
near = false; arrival.Start(); arrival.Skip(); assert.equal(arrival.phase, 'guide');
for (let n = 0; n < 20; n++) arrival.Update(.1);
assert.equal(releases, 1, 'skip must wait for actual guide'); near = true;
for (let n = 0; n < 20; n++) arrival.Update(.1);
assert.equal(releases, 2); assert.equal(arrival.phase, 'complete'); assert.equal(arrival.View().fade, 0);
arrival.Dispose();
arrival.Restore({ version: 2, phase: 'door', elapsed: .4, brakeBeat:P012_ARRIVAL.brakeBeats.length-1 });
assert(door > 0 && door < 1); assert.equal(releases, 2); arrival.Dispose();
const document = { createElement() { return { ownerDocument: document, style: {}, dataset: {}, children: [], append(...children) { this.children.push(...children); }, remove() { this.removed = true; } }; } };
const parent = document.createElement(); const view = new FirstLevelP012ArrivalView(parent); const root = view.root;
view.Render({ fade: 1, title: P012_ARRIVAL.title, date: P012_ARRIVAL.date }); assert.equal(root.style.display, 'block');
view.Dispose(); view.Dispose(); assert.equal(root.removed, true);
console.log('PASS P012 arrival: physical guide gate, continuous audio, short fade, skip, restore and cleanup');
