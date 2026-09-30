// Evaluates Data_OpeningFirstPersonGear: the eye, the rifle, the pack, the crate and the two hands' targets at a clock t
// (seconds since Luo's order). No DOM and no WebGL: the director asks for the eye (GearCamera), the first-person body for the
// objects and hands (GearPose), the node tests for both.
//
// The pack and the rifle are keyed in a frame ("cam" or "world") and blended in WORLD space at the moment asked, so a hand key on
// the pack ("pack" frame) or on the rifle follows the object wherever the camera has taken it, and a key from the camera to the
// wall carries the object across the room with the camera moving under it.
import * as THREE from "three";
import { FrameQuaternion } from "./Script_FpsAnatomy.mjs";
import { OPENING_GEAR_UP as DEFAULT_GEAR } from "./Data_OpeningFirstPersonGear.mjs";
import { TILE_METERS } from "./Script_Geo.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const DEG = Math.PI / 180;
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const Smooth = (v) => { v = Clamp(v); return v * v * (3 - 2 * v); };

let GEAR = DEFAULT_GEAR;
/** The data in force (the bench swaps it: Debug.OpeningGearUp.Set). */
export const GearData = () => GEAR;
export function SetGearData(spec) { GEAR = spec || DEFAULT_GEAR; return GEAR; }

/**
 * Value at t of keys [[t, v], ...] by a monotone cubic Hermite (Fritsch-Carlson): passes every key, never overshoots between
 * two, is flat over an equal pair (a hold) and has no kink at a key. A null value is `fallback` (the seated eye).
 */
export function GearTrack(keys, t, fallback = 0) {
  const n = keys.length, at = (i) => (keys[i][1] == null ? fallback : keys[i][1]);
  if (n === 0) return fallback;
  if (!(t > keys[0][0])) return at(0);
  if (!(t < keys[n - 1][0])) return at(n - 1);
  let i = 1;
  while (t >= keys[i][0]) i++;
  const Slope = (k) => (at(k + 1) - at(k)) / Math.max(1e-9, keys[k + 1][0] - keys[k][0]);
  const Tangent = (k) => {
    if (k === 0) return Slope(0) * 0;                  // ease out of the first key and into the last
    if (k === n - 1) return 0;
    const a = Slope(k - 1), b = Slope(k);
    if (a * b <= 0) return 0;
    const wa = keys[k + 1][0] - keys[k][0], wb = keys[k][0] - keys[k - 1][0], w1 = 2 * wa + wb, w2 = wa + 2 * wb;
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const t0 = keys[i - 1][0], t1 = keys[i][0], h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
  const m0 = Tangent(i - 1) * h, m1 = Tangent(i) * h;
  return (2 * u3 - 3 * u2 + 1) * at(i - 1) + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * at(i) + (u3 - u2) * m1;
}

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Metres travelled t seconds into a run that accelerates over rampS to mps and pulls up over the last stopEaseM of `length`. */
export function GearRunDistance(u, length, move) {
  if (!(u > 0)) return 0;
  const E = move.stopEaseM;
  let d = move.mps * (u < move.rampS ? u * u / (2 * move.rampS) : u - move.rampS / 2);
  const x = d - (length - E);
  if (x > 0) d = x >= 2 * E ? length : length - E + x - x * x / (4 * E);
  return Math.min(length, d);
}
/** Seconds after its t0 at which a run of `length` metres has arrived. */
export function GearRunSeconds(length, move) {
  const raw = length + move.stopEaseM, u = raw / move.mps + move.rampS / 2;
  return u >= move.rampS ? u : Math.sqrt(2 * move.rampS * raw / move.mps);
}

/** Ground position of the eye at t: { x, z } from the moves (ctx: seat, followTo). */
export function GearPoint(t, ctx, spec = GEAR) {
  let at = { x: ctx.seat.x, z: ctx.seat.z };
  for (const move of spec.cam.moves) {
    const to = move.to === "followTo" ? ctx.followTo : spec.cam[move.to];
    if (t <= move.t0) return at;
    if (move.t1 != null) {
      if (t < move.t1) { const u = Smooth((t - move.t0) / (move.t1 - move.t0)); return { x: at.x + (to.x - at.x) * u, z: at.z + (to.z - at.z) * u }; }
    } else {
      const length = Distance(at, to), d = GearRunDistance(t - move.t0, length, move), w = length > 0 ? d / length : 1;
      if (w < 1) return { x: at.x + (to.x - at.x) * w, z: at.z + (to.z - at.z) * w };
    }
    at = { x: to.x, z: to.z };
  }
  return at;
}

/** The eye at t: ground point, height above the floor, heading / pitch / roll (radians), speed (m/s) and pace (0..1). */
export function GearCamera(t, ctx, spec = GEAR) {
  const C = spec.cam, point = GearPoint(t, ctx, spec), seated = ctx.seatEyeM ?? 1;
  const run = C.moves.find((m) => m.mps), a = GearPoint(t - .03, ctx, spec), b = GearPoint(t + .03, ctx, spec);
  const speed = Distance(a, b) / .06, pace = run ? Clamp(speed / run.mps) : 0;
  const step = run ? Math.PI * C.bob.stepHz * Math.max(0, t - run.t0) : 0, nod = Math.abs(Math.sin(step)) * 2 - 1;
  // Standing still he breathes: a slow small rise and fall and sway, faded out as the pace comes up.
  const still = 1 - pace, breath = Math.sin(t * Math.PI * 2 * C.bob.breathHz);
  return { x: point.x, z: point.z, speed, pace,
    height: GearTrack(C.heightM, t, seated) + C.bob.m * pace * nod + C.bob.breathM * still * breath,
    yaw: GearTrack(C.yawDeg, t) * DEG,
    pitch: GearTrack(C.pitchDeg, t) * DEG - C.bob.pitchRad * pace * nod + C.bob.breathRad * still * Math.sin(t * Math.PI * 2 * C.bob.breathHz * .7),
    roll: GearTrack(C.rollDeg, t) * DEG + C.bob.swayRad * pace * Math.sin(step) + C.bob.breathRad * still * Math.sin(t * Math.PI * 2 * C.bob.breathHz * .53) };
}
/** Seconds since the order at which the run arrives (the eye has stopped at followTo). */
export function GearArrivalS(ctx, spec = GEAR) {
  let at = { x: ctx.seat.x, z: ctx.seat.z }, end = 0;
  for (const move of spec.cam.moves) {
    const to = move.to === "followTo" ? ctx.followTo : spec.cam[move.to];
    end = move.t1 != null ? move.t1 : move.t0 + GearRunSeconds(Distance(at, to), move);
    at = to;
  }
  return end;
}

// ---- objects ---------------------------------------------------------------------------------------------------------
/** A frame's world transform: { p: Vector3, q: Quaternion, ground: bool } */
function FrameOf(frame, ctx) {
  if (frame === "cam") return { p: ctx.cam.position, q: ctx.cam.quaternion, ground: false };
  return { p: V(), q: Q(), ground: true };
}
const ToWorld = (frame, point, ctx) => {
  const F = FrameOf(frame, ctx), p = V(...point);
  if (F.ground) { p.y += ctx.Ground(p.x, p.z); return p; }
  return p.applyQuaternion(F.q).add(F.p);
};
const DirWorld = (frame, dir, ctx) => V(...dir).normalize().applyQuaternion(FrameOf(frame, ctx).q);

/** Pack pose at rest, stood on the ground against the earth: { position, quaternion } (pack-local +z is the straps' side). */
export function GearPackRest(Ground, spec = GEAR) {
  const R = spec.pack.rest, [w, h, d] = spec.pack.sizeM, lean = R.leanDeg * DEG;
  const q = Q().setFromAxisAngle(V(0, 1, 0), R.yawDeg * DEG).multiply(Q().setFromAxisAngle(V(1, 0, 0), -lean));
  const y = Ground(R.x, R.z) + h / 2 * Math.cos(lean) + d / 2 * Math.sin(lean);
  return { position: V(R.x, y, R.z), quaternion: q };
}

function PackKeyPose(key, ctx, spec) {
  if (key[1] === "world") return ctx.packRest ||= GearPackRest(ctx.Ground, spec);
  const q = FrameQuaternion(DirWorld("cam", key[3], ctx).negate(), DirWorld("cam", key[4], ctx));
  return { position: ToWorld("cam", key[2], ctx), quaternion: q };
}
function RifleKeyPose(key, ctx) {
  if (key[1] === "lap") return ctx.lap || null;
  const frame = key[1], q = FrameQuaternion(DirWorld(frame, key[3], ctx).negate(), DirWorld(frame, key[4], ctx));
  const anchor = V(...key[5]).applyQuaternion(q);
  return { position: ToWorld(frame, key[2], ctx).sub(anchor), quaternion: q };
}
/** The two keys around t, the eased mix between them, and their poses blended in world space. */
function Blend(keys, t, Resolve) {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && t >= keys[i + 1][0]) i++;
  const b = Math.min(n - 1, i + 1), a = keys[i], next = keys[b];
  let pa = Resolve(a), pb = b === i ? pa : Resolve(next);
  // A "lap" key with no lap rifle known (a jump into the middle of the action) takes the pose of its neighbour.
  pa ||= pb; pb ||= pa;
  const mix = b === i ? 0 : Smooth((t - a[0]) / Math.max(1e-6, next[0] - a[0]));
  if (!pa) return null;
  return { position: pa.position.clone().lerp(pb.position, mix), quaternion: pa.quaternion.clone().slerp(pb.quaternion, mix), mix, from: i };
}

function HandKeyPoint(key, side, ctx, objects) {
  const frame = key[1], p = key[2], f = key[3], n = key[4], hold = objects[frame];
  let target, forward, normal;
  if (frame === "cam") { target = ToWorld("cam", p, ctx); forward = DirWorld("cam", f, ctx); normal = DirWorld("cam", n, ctx); }
  else if (hold) {
    target = V(...p).applyQuaternion(hold.quaternion).add(hold.position);
    forward = V(...f).normalize().applyQuaternion(hold.quaternion); normal = V(...n).normalize().applyQuaternion(hold.quaternion);
  } else return null;
  const c = key[5];
  return { target, frame: FrameQuaternion(forward, normal), curl: typeof c === "string" ? null : c, shape: typeof c === "string" ? c : null, sh: key[6] || null };
}
/** A hand's target at t: { target, frame, curl | shape, on } eased between its two keys. */
function HandAt(keys, side, t, ctx, objects) {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && t >= keys[i + 1][0]) i++;
  const b = Math.min(n - 1, i + 1), A = HandKeyPoint(keys[i], side, ctx, objects), B = b === i ? A : HandKeyPoint(keys[b], side, ctx, objects);
  const from = A || B, to = B || A;
  if (!from) return null;
  const mix = b === i ? 0 : Smooth((t - keys[i][0]) / Math.max(1e-6, keys[b][0] - keys[i][0]));
  const curlA = from.curl, curlB = to.curl;
  // The shoulder root (camera-local; a key may bring it in: reaching down with the eye near the floor, the default root is too far behind).
  const base = [side === "l" ? -ctx.shoulder[0] : ctx.shoulder[0], ctx.shoulder[1], ctx.shoulder[2]], sa = from.sh || base, sb = to.sh || base;
  const sh = from.sh || to.sh ? sa.map((v, k) => v + (sb[k] - v) * mix) : null;
  return { sh, target: from.target.clone().lerp(to.target, mix), frame: from.frame.clone().slerp(to.frame, mix),
    curl: curlA && curlB ? curlA.map((v, k) => v + (curlB[k] - v) * mix) : (curlA || curlB || null),
    shapeA: from.shape, shapeB: to.shape, shapeMix: mix, curlA, curlB, on: mix < .5 ? keys[i][1] : keys[b][1], mix };
}

/**
 * Everything the body needs at t. ctx: { cam (position, quaternion), Ground(x, z), lap: { position, quaternion } | null }.
 * Returns { t, rifle: {position, quaternion}, pack: {position, quaternion, visible, onBack, straps}, crate: {visible}, charger: {visible, depth,
 * pressing}, hands: { l, r } } with world-space hand targets (target, frame quaternion, curl / shape).
 */
export function GearPose(t, ctx, spec = GEAR) {
  const rifle = Blend(spec.rifle.keys, t, (k) => RifleKeyPose(k, ctx));
  const pack = Blend(spec.pack.keys, t, (k) => PackKeyPose(k, ctx, spec));
  const objects = { rifle, pack, cam: true };
  const hands = { l: HandAt(spec.hands.l, "l", t, ctx, objects), r: HandAt(spec.hands.r, "r", t, ctx, objects) };
  const ch = spec.rifle.charger, u = (t - ch.press[0]) / (ch.press[1] - ch.press[0]), depth = ch.pressM * Smooth(u);
  const thumb = u > 0 && u < 1 ? ch.thumbM * Math.max(0, Math.sin(Math.PI * 2 * ch.thumbHz * (t - ch.press[0]))) : 0;
  // Over the charger the right hand rides the rounds down (its keys are the pressed-down point) and the thumb works in short strokes.
  const ride = Smooth((t - ch.ride[0]) / ch.ride[1]) * (1 - Smooth((t - ch.ride[2]) / ch.ride[3])) * (ch.pressM - depth + thumb);
  if (rifle && hands.r && ride) hands.r.target.addScaledVector(V(0, 1, 0).applyQuaternion(rifle.quaternion), ride);
  return { t, rifle, pack: pack && { ...pack, visible: t < spec.pack.onBackS, onBack: t >= spec.pack.onBackS,
    straps: t >= spec.pack.onBackS && t < spec.pack.strapsOffS },
    crate: { visible: t < spec.crate.hideS },
    charger: { visible: t < ch.offS, depth, pressing: u > 0 && u < 1, thumb, rideM: ride },
    hands };
}

// ---- the pack's mesh ------------------------------------------------------------------------------------------------------
/** A flat strap swept along `points` (pack-local), `width` across x, `thick` through its face; UV in metres over the tile. */
function StrapGeometry(points, width, thick, tile) {
  const positions = [], uvs = [], index = [], hw = width / 2, ht = thick / 2, across = V(1, 0, 0);
  let run = 0;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tangent = b.clone().sub(a).normalize(), normal = V().crossVectors(across, tangent).normalize();
    if (i) run += p.distanceTo(points[i - 1]);
    for (const [x, n] of [[-hw, -ht], [hw, -ht], [hw, ht], [-hw, ht]]) {
      const v = p.clone().addScaledVector(across, x).addScaledVector(normal, n);
      positions.push(v.x, v.y, v.z); uvs.push(x / tile, run / tile);
    }
  });
  for (let i = 0; i < points.length - 1; i++) for (let c = 0; c < 4; c++) {
    const a = i * 4 + c, b = i * 4 + (c + 1) % 4, a2 = a + 4, b2 = b + 4;
    index.push(a, b, a2, b, b2, a2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/**
 * The pack (Data_OpeningFirstPersonGear.pack): a canvas body with rounded edges, a blanket rolled over the top, a flap with its
 * buckled strap on the front, and on the back (+z) two shoulder loops with buckles. materials: { canvas, roll, strap, steel }
 * (the soldier's own cloth / webbing / steel; shared, so not owned), or stand-in colours without them. own(item) is told every
 * geometry and stand-in material made here so the caller can dispose them.
 */
export function BuildGearPack(spec, materials = null, own = () => {}) {
  const [w, h, d] = spec.sizeM, [rollLen, rollR] = spec.rollM, [lw, lh, ld] = spec.loopM, tile = TILE_METERS.cloth;
  const M = materials ? { ...materials } : (() => {
    const make = (color, roughness = .95, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); own(m); return m; };
    return { canvas: make(0x8a7f62), roll: make(0x4d4a40), strap: make(0x6d6248), steel: make(0x777770, .5, .6) };
  })();
  // The soldier's own cloth (shared) taken to what each part is: khaki canvas, dark brown webbing straps, the grey wool of a rolled
  // blanket (a private, darker copy of each: the loops must read against the panel, and the straps stay off the bright side).
  if (materials) {
    const Shade = (source, r, g, b) => { const m = CloneShadedMaterial(source); m.color.multiply(new THREE.Color(r, g, b)); own(m); return m; };
    M.canvas = Shade(materials.canvas, ...(spec.canvasShade || [.8, .76, .66]));
    M.strap = Shade(materials.strap, ...(spec.strapShade || [.5, .46, .38]));
    M.roll = Shade(materials.roll, ...(spec.rollShade || [.7, .68, .62]));
  }
  const group = new THREE.Group(); group.name = "OpeningGearPack";
  const Add = (geometry, material, name, at = null) => {
    // Only the big shapes cast (the loops lie on the panel: their shadows are acne lines on it).
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = /_Body$|_Roll$|_Flap$/.test(name); mesh.receiveShadow = true;
    if (at) mesh.position.set(...at);
    group.add(mesh); own(geometry); return mesh;
  };
  const Metres = (geometry, scale) => { const uv = geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale, uv.getY(i) * scale); return geometry; };
  // Body: a rounded slab (the outline rounded, the faces bevelled).
  const bevel = .022, r = .05, sw = w - 2 * bevel, sh = h - 2 * bevel, shape = new THREE.Shape();
  shape.moveTo(-sw / 2 + r, -sh / 2); shape.lineTo(sw / 2 - r, -sh / 2); shape.quadraticCurveTo(sw / 2, -sh / 2, sw / 2, -sh / 2 + r);
  shape.lineTo(sw / 2, sh / 2 - r); shape.quadraticCurveTo(sw / 2, sh / 2, sw / 2 - r, sh / 2); shape.lineTo(-sw / 2 + r, sh / 2);
  shape.quadraticCurveTo(-sw / 2, sh / 2, -sw / 2, sh / 2 - r); shape.lineTo(-sw / 2, -sh / 2 + r); shape.quadraticCurveTo(-sw / 2, -sh / 2, -sw / 2 + r, -sh / 2);
  const depth = d - 2 * bevel;
  const body = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  body.translate(0, 0, -depth / 2);
  Add(Metres(body, 1 / tile), M.canvas, "OpeningGearPack_Body");
  // The blanket rolled over the top, and the two thin straps that hold the roll.
  const roll = new THREE.CylinderGeometry(rollR, rollR, rollLen, 16, 1); roll.rotateZ(Math.PI / 2);
  Add(Metres(roll, 1 / tile * 2), M.roll, "OpeningGearPack_Roll", [0, h / 2 + rollR * .55, -d * .06]);
  for (const x of [-.1, .1]) {
    const band = new THREE.CylinderGeometry(rollR * 1.07, rollR * 1.07, .036, 18, 1, true); band.rotateZ(Math.PI / 2);
    Add(Metres(band, 1 / tile * 2), M.strap, "OpeningGearPack_RollStrap", [x, h / 2 + rollR * .55, -d * .06]);
  }
  // The flap and its buckled strap on the front.
  Add(Metres(new THREE.BoxGeometry(w * .92, h * .52, .016), 1 / tile * .3), M.canvas, "OpeningGearPack_Flap", [0, h * .13, -d / 2 - .005]);
  Add(new THREE.BoxGeometry(.03, h * .5, .008), M.strap, "OpeningGearPack_FlapStrap", [0, h * .1, -d / 2 - .016]);
  Add(new THREE.BoxGeometry(.036, .03, .01), M.steel, "OpeningGearPack_FlapBuckle", [0, h * .02, -d / 2 - .02]);
  // The shoulder loops on the back panel (+z): up from the bottom corner, out over the panel, down again to the top; the hands take them.
  for (const s of [-1, 1]) {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      points.push(V(s * .11, h / 2 - .02 - u * lh, d / 2 + ld * Math.pow(Math.sin(Math.PI * u), .7)));
    }
    Add(StrapGeometry(points, lw, .008, tile), M.strap, "OpeningGearPack_Loop", null);
    Add(new THREE.BoxGeometry(lw * .95, .03, .012), M.steel, "OpeningGearPack_LoopBuckle", [s * .11, h / 2 - .02 - lh * .62, d / 2 + ld * .95]);
  }
  return group;
}
