import assert from "node:assert/strict";
import { RaycastCapsule, RaycastEllipsoid, RaycastSphere } from "./Script_CharacterHitboxMath.mjs";

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${label}: expected ${expected}, got ${actual}`);
const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const upward = { x: 0, y: 1, z: 0 };

near(RaycastSphere(origin, forward, { x: 0, y: 0, z: 4 }, 0.5), 3.5, "sphere first hit");
assert.equal(RaycastSphere(origin, forward, { x: 1, y: 0, z: 4 }, 0.5), null, "sphere miss");

const unitAxes = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};
const headRadii = { x: 0.15, y: 0.15, z: 0.12 };
near(RaycastEllipsoid(origin, forward, { x: 0, y: 0, z: 4 }, headRadii, unitAxes), 3.88,
  "ellipsoid narrow-axis first hit");
assert.equal(RaycastEllipsoid({ x: 0, y: 0, z: 0.121 }, upward,
  { x: 0, y: 4, z: 0 }, headRadii, unitAxes), null, "ellipsoid width near miss");
near(RaycastEllipsoid({ x: 0, y: 0, z: 0.119 }, upward,
  { x: 0, y: 4, z: 0 }, headRadii, unitAxes),
4 - 0.15 * Math.sqrt(1 - (0.119 / 0.12) ** 2), "ellipsoid width near-edge hit");
assert.equal(RaycastEllipsoid({ x: 0, y: 0, z: 4 }, forward,
  { x: 0, y: 0, z: 4 }, headRadii, unitAxes), 0, "ray starts inside ellipsoid");

const top = { x: 0, y: 1, z: 5 }, bottom = { x: 0, y: -1, z: 5 };
near(RaycastCapsule(origin, forward, top, bottom, 0.4), 4.6, "capsule cylinder first hit");
near(RaycastCapsule({ x: 0.25, y: 1.25, z: 0 }, forward, top, bottom, 0.4),
  5 - Math.sqrt(0.4 * 0.4 - 0.25 * 0.25 - 0.25 * 0.25), "capsule cap first hit");
assert.equal(RaycastCapsule({ x: 0.41, y: 0, z: 0 }, forward, top, bottom, 0.4), null,
  "capsule near miss");
assert.equal(RaycastCapsule({ x: 0, y: 0, z: 5 }, forward, top, bottom, 0.4), 0,
  "ray starts inside capsule");

console.log("CharacterHitboxMathTest OK — exact sphere/ellipsoid/capsule entry, miss and inside cases");
