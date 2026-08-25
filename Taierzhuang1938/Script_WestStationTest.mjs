// 津浦路滕县站的独立建造器冒烟：不依赖场景注册，锁定站场作业物的可见/碰撞契约。

import assert from "node:assert/strict";
import { BuildStation } from "./Script_Landmark_Station.mjs";

function MakeSink() {
  return {
    adds: [],
    solids: [],
    covers: [],
    sector: null,
    Add(material, geometry) { this.adds.push({ material, geometry }); },
    Solid(x, y, z, hx, hy, hz, tag, ry = 0) {
      this.solids.push({ x, y, z, hx, hy, hz, tag, ry });
    },
    Cover(x, z, height, nx, nz) { this.covers.push({ x, z, height, nx, nz }); },
    SetSector(sector) { this.sector = sector; },
  };
}

const sink = MakeSink();
const farSink = MakeSink();
BuildStation({
  sink,
  farSink,
  OuterHeight: () => 0,
}, {
  id: "westStationTest",
  x: -463,
  z: 0,
  w: 34,
  d: 12,
  railway: { x: -480, gauge: 1.435, fromZ: -96, toZ: 96, crossings: [0] },
}, { ry: 0, damage: 0 });

const signals = sink.solids.filter((solid) => solid.tag === "villagePost"
  && Math.abs(solid.x - -477.85) < 0.01 && Math.abs(Math.abs(solid.z) - 40) < 0.01);
const freight = sink.solids.filter((solid) => solid.tag === "furniture"
  && solid.x < -470 && solid.z > -17 && solid.z < -5);
assert.equal(signals.length, 2, "station must have two end-of-platform semaphore masts");
assert.equal(freight.length, 5, "freight apron must retain crates and two handcarts");
assert.ok(sink.adds.length > 250, "station should emit a rich procedural geometry set");
assert.ok(sink.covers.length >= 6, "station walls must preserve indoor cover registration");

for (const { geometry } of [...sink.adds, ...farSink.adds]) geometry.dispose();
console.log("West station builder: PASS (signals, freight apron, cargo, rail geometry)");
