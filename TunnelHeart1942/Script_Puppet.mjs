/**
 * Spine-inspired modular 2D puppet (no runtime deps).
 * Parts on a bone hierarchy + clip keyframes → walk / idle / crouch / dig.
 */

/** @typedef {{ parent: string|null, len: number, angle: number }} BoneDef */
/** @typedef {{ fill: string, stroke?: string, w: number, h: number, kind?: "capsule"|"head"|"boot"|"helmet" }} PartDef */

/**
 * Bone local rest — angles in radians.
 * World convention: angle 0 points +Y (down the screen); π points up.
 * Child worldAngle = parent.worldAngle + localAngle.
 */
export const BONE_DEFS = {
  root: { parent: null, len: 0, angle: 0 },
  hip: { parent: "root", len: 0, angle: 0 },
  // torso grows upward from hip
  torso: { parent: "hip", len: 22, angle: Math.PI },
  neck: { parent: "torso", len: 5, angle: 0 },
  head: { parent: "neck", len: 9, angle: 0 },
  // legs grow downward
  thighL: { parent: "hip", len: 15, angle: 0.14 },
  shinL: { parent: "thighL", len: 14, angle: -0.06 },
  footL: { parent: "shinL", len: 4, angle: Math.PI / 2 - 0.14 },
  thighR: { parent: "hip", len: 15, angle: -0.14 },
  shinR: { parent: "thighR", len: 14, angle: 0.06 },
  footR: { parent: "shinR", len: 4, angle: -(Math.PI / 2 - 0.14) },
  // arms hang roughly down from upper torso
  armL: { parent: "torso", len: 11, angle: Math.PI + 0.55 },
  foreL: { parent: "armL", len: 10, angle: 0.15 },
  handL: { parent: "foreL", len: 3, angle: 0 },
  armR: { parent: "torso", len: 11, angle: Math.PI - 0.55 },
  foreR: { parent: "armR", len: 10, angle: -0.15 },
  handR: { parent: "foreR", len: 3, angle: 0 },
};

const PART_ON = {
  torso: { fill: "tunic", w: 18, h: 24, kind: "capsule" },
  head: { fill: "skin", w: 16, h: 16, kind: "head" },
  thighL: { fill: "tunic", w: 8, h: 16, kind: "capsule" },
  shinL: { fill: "puttee", w: 7, h: 15, kind: "capsule" },
  footL: { fill: "boot", w: 10, h: 5, kind: "boot" },
  thighR: { fill: "tunic", w: 8, h: 16, kind: "capsule" },
  shinR: { fill: "puttee", w: 7, h: 15, kind: "capsule" },
  footR: { fill: "boot", w: 10, h: 5, kind: "boot" },
  armL: { fill: "tunic", w: 7, h: 12, kind: "capsule" },
  foreL: { fill: "skin", w: 6, h: 11, kind: "capsule" },
  armR: { fill: "tunic", w: 7, h: 12, kind: "capsule" },
  foreR: { fill: "skin", w: 6, h: 11, kind: "capsule" },
};

export const PALETTES = {
  militia: {
    tunic: "#4d6b57",
    puttee: "#3a4a38",
    boot: "#2a2118",
    skin: "#e7d0b0",
    accent: "#c9a45a",
    ink: "#1a1410",
    helmet: null,
  },
  elder: {
    tunic: "#3d4a3a",
    puttee: "#2e3830",
    boot: "#241c14",
    skin: "#d8c09a",
    accent: "#a6452f",
    ink: "#1a1410",
    helmet: null,
  },
  woman: {
    tunic: "#6a4a3a",
    puttee: "#5a3a2a",
    boot: "#2a2118",
    skin: "#edd4b8",
    accent: "#8b2e22",
    ink: "#1a1410",
    helmet: null,
  },
  villager: {
    tunic: "#8a6238",
    puttee: "#6a4a28",
    boot: "#2a2118",
    skin: "#e7d0b0",
    accent: "#c9a45a",
    ink: "#1a1410",
    helmet: null,
  },
  /** 日军 — khaki + steel helmet with front star. */
  ijp: {
    tunic: "#6a6848",
    puttee: "#4a4830",
    boot: "#1a1810",
    skin: "#c9b089",
    accent: "#8b1e1e",
    ink: "#1a1410",
    helmet: "#3a3c28",
    helmetKind: "ija",
  },
  /** 伪军 — grey-blue tunic + peaked cap (no IJA helmet). */
  puppet: {
    tunic: "#3a4a58",
    puttee: "#2a343c",
    boot: "#1a1410",
    skin: "#d8c0a0",
    accent: "#5a6a40",
    ink: "#1a1410",
    helmet: "#2a3038",
    helmetKind: "peaked",
  },
  /** Legacy alias → 日军. */
  enemy: {
    tunic: "#6a6848",
    puttee: "#4a4830",
    boot: "#1a1810",
    skin: "#c9b089",
    accent: "#8b1e1e",
    ink: "#1a1410",
    helmet: "#3a3c28",
    helmetKind: "ija",
  },
  spy: {
    tunic: "#5a4030",
    puttee: "#3a3028",
    boot: "#1a1410",
    skin: "#e7d0b0",
    accent: "#a6452f",
    ink: "#1a1410",
    helmet: null,
  },
};

/**
 * Clip keyframes: t in [0,1], bone local angle offsets (radians) added to rest.
 * @type {Record<string, { duration: number, keys: Record<string, number>[] }>}
 */
export const CLIPS = {
  idle: {
    duration: 1.8,
    keys: [
      { t: 0, torso: 0, neck: 0, armL: 0.04, armR: -0.04, thighL: 0.02, thighR: -0.02, _hipY: 0 },
      { t: 0.5, torso: 0.02, neck: 0.015, armL: -0.03, armR: 0.03, thighL: -0.015, thighR: 0.015, _hipY: 0.6 },
      { t: 1, torso: 0, neck: 0, armL: 0.04, armR: -0.04, thighL: 0.02, thighR: -0.02, _hipY: 0 },
    ],
  },
  // Contact → pass → contact → pass. Soft VH-style stride + hip bob (_hipY).
  walk: {
    duration: 0.72,
    keys: [
      {
        // L heel contact, R toe-off
        t: 0,
        torso: 0.05,
        neck: -0.02,
        thighL: 0.34,
        shinL: -0.08,
        footL: 0.08,
        thighR: -0.3,
        shinR: 0.34,
        footR: -0.14,
        armL: -0.38,
        foreL: 0.12,
        armR: 0.34,
        foreR: -0.08,
        _hipY: 1.4,
      },
      {
        // L mid-stance, R swing through (knee tucked)
        t: 0.25,
        torso: 0.015,
        neck: 0.012,
        thighL: 0.04,
        shinL: -0.02,
        footL: 0.02,
        thighR: 0.14,
        shinR: -0.44,
        footR: 0.18,
        armL: -0.1,
        foreL: 0.05,
        armR: 0.12,
        foreR: -0.03,
        _hipY: -0.4,
      },
      {
        // R heel contact, L toe-off
        t: 0.5,
        torso: 0.05,
        neck: -0.02,
        thighL: -0.3,
        shinL: 0.34,
        footL: -0.14,
        thighR: 0.34,
        shinR: -0.08,
        footR: 0.08,
        armL: 0.34,
        foreL: -0.08,
        armR: -0.38,
        foreR: 0.12,
        _hipY: 1.4,
      },
      {
        // R mid-stance, L swing through
        t: 0.75,
        torso: 0.015,
        neck: 0.012,
        thighL: 0.14,
        shinL: -0.44,
        footL: 0.18,
        thighR: 0.04,
        shinR: -0.02,
        footR: 0.02,
        armL: 0.12,
        foreL: -0.03,
        armR: -0.1,
        foreR: 0.05,
        _hipY: -0.4,
      },
      {
        t: 1,
        torso: 0.05,
        neck: -0.02,
        thighL: 0.34,
        shinL: -0.08,
        footL: 0.08,
        thighR: -0.3,
        shinR: 0.34,
        footR: -0.14,
        armL: -0.38,
        foreL: 0.12,
        armR: 0.34,
        foreR: -0.08,
        _hipY: 1.4,
      },
    ],
  },
  /**
   * Deep sneak crouch — hip drops hard, thighs near horizontal, shins tucked,
   * torso tips forward over the knees (negative torso = lean into facing).
   * Soft breath bob only; travel uses crouchWalk.
   */
  crouch: {
    duration: 1.35,
    keys: [
      {
        t: 0,
        torso: -0.28,
        neck: -0.08,
        thighL: 1.42,
        shinL: -2.48,
        footL: 0.98,
        thighR: 1.34,
        shinR: -2.38,
        footR: 0.92,
        armL: 0.78,
        foreL: 0.42,
        armR: 0.92,
        foreR: 0.48,
        _hipY: 0,
      },
      {
        t: 0.5,
        torso: -0.3,
        neck: -0.1,
        thighL: 1.4,
        shinL: -2.5,
        footL: 1.02,
        thighR: 1.36,
        shinR: -2.4,
        footR: 0.95,
        armL: 0.82,
        foreL: 0.45,
        armR: 0.88,
        foreR: 0.5,
        _hipY: 0.8,
      },
      {
        t: 1,
        torso: -0.28,
        neck: -0.08,
        thighL: 1.42,
        shinL: -2.48,
        footL: 0.98,
        thighR: 1.34,
        shinR: -2.38,
        footR: 0.92,
        armL: 0.78,
        foreL: 0.42,
        armR: 0.92,
        foreR: 0.48,
        _hipY: 0,
      },
    ],
  },
  /** Duck-walk while holding crouch — weight shifts, knees stay bent. */
  crouchWalk: {
    duration: 0.62,
    keys: [
      {
        t: 0,
        torso: -0.26,
        neck: -0.08,
        thighL: 1.55,
        shinL: -2.35,
        footL: 0.78,
        thighR: 1.22,
        shinR: -2.5,
        footR: 1.05,
        armL: 0.7,
        foreL: 0.35,
        armR: 1.0,
        foreR: 0.5,
        _hipY: 0.6,
      },
      {
        t: 0.25,
        torso: -0.3,
        neck: -0.1,
        thighL: 1.38,
        shinL: -2.45,
        footL: 0.95,
        thighR: 1.38,
        shinR: -2.4,
        footR: 0.9,
        armL: 0.85,
        foreL: 0.42,
        armR: 0.85,
        foreR: 0.42,
        _hipY: -0.4,
      },
      {
        t: 0.5,
        torso: -0.26,
        neck: -0.08,
        thighL: 1.22,
        shinL: -2.5,
        footL: 1.05,
        thighR: 1.55,
        shinR: -2.35,
        footR: 0.78,
        armL: 1.0,
        foreL: 0.5,
        armR: 0.7,
        foreR: 0.35,
        _hipY: 0.6,
      },
      {
        t: 0.75,
        torso: -0.3,
        neck: -0.1,
        thighL: 1.38,
        shinL: -2.4,
        footL: 0.9,
        thighR: 1.38,
        shinR: -2.45,
        footR: 0.95,
        armL: 0.85,
        foreL: 0.42,
        armR: 0.85,
        foreR: 0.42,
        _hipY: -0.4,
      },
      {
        t: 1,
        torso: -0.26,
        neck: -0.08,
        thighL: 1.55,
        shinL: -2.35,
        footL: 0.78,
        thighR: 1.22,
        shinR: -2.5,
        footR: 1.05,
        armL: 0.7,
        foreL: 0.35,
        armR: 1.0,
        foreR: 0.5,
        _hipY: 0.6,
      },
    ],
  },
  // Coil shovel BACK → bite FORWARD into the wall (local +X = facing after scale).
  // Verified: armR≈-1.8 + torso≈0.3 → hand behind; armR≈1.9 + torso≈-0.15 → hand forward.
  dig: {
    duration: 0.42,
    keys: [
      {
        t: 0,
        torso: 0.18,
        neck: 0.06,
        armR: -1.5,
        foreR: 0.25,
        armL: 0.4,
        foreL: 0.15,
        thighL: 0.26,
        shinL: -0.16,
        thighR: -0.2,
        shinR: 0.1,
        _hipY: 2,
      },
      {
        t: 0.24,
        torso: 0.34,
        neck: 0.12,
        armR: -1.85,
        foreR: 0.35,
        armL: 0.55,
        foreL: 0.2,
        thighL: 0.38,
        shinL: -0.26,
        thighR: -0.3,
        shinR: 0.14,
        _hipY: 3.2,
      },
      {
        t: 0.5,
        torso: -0.16,
        neck: -0.08,
        armR: 1.95,
        foreR: 0.45,
        armL: -0.25,
        foreL: 0.15,
        thighL: 0.48,
        shinL: -0.36,
        thighR: -0.34,
        shinR: 0.18,
        footL: 0.1,
        _hipY: 4.4,
      },
      {
        t: 0.74,
        torso: 0.06,
        neck: 0.02,
        armR: 0.85,
        foreR: 0.28,
        armL: 0.1,
        thighL: 0.28,
        shinL: -0.16,
        thighR: -0.16,
        _hipY: 2.4,
      },
      {
        t: 1,
        torso: 0.08,
        neck: 0.02,
        armR: -0.15,
        foreR: 0.12,
        armL: 0.15,
        thighL: 0.12,
        thighR: -0.08,
        _hipY: 0.8,
      },
    ],
  },
  alert: {
    duration: 0.8,
    keys: [
      { t: 0, torso: 0.1, armR: -1.2, foreR: 0.3, armL: 0.5, thighL: 0.15, thighR: -0.1 },
      { t: 0.5, torso: 0.12, armR: -1.35, foreR: 0.2, armL: 0.55, thighL: 0.1, thighR: -0.05 },
      { t: 1, torso: 0.1, armR: -1.2, foreR: 0.3, armL: 0.5, thighL: 0.15, thighR: -0.1 },
    ],
  },
  // Hungry close-range KO — long coil, whip chop, settle (ritual impact).
  melee: {
    duration: 0.68,
    keys: [
      {
        t: 0,
        torso: -0.22,
        neck: -0.16,
        armR: 1.35,
        foreR: -0.75,
        armL: 0.65,
        foreL: 0.25,
        thighL: 0.32,
        shinL: -0.22,
        thighR: -0.28,
        shinR: 0.14,
        footR: -0.1,
        _hipY: 1.6,
      },
      {
        t: 0.22,
        torso: -0.32,
        neck: -0.2,
        armR: 1.55,
        foreR: -0.9,
        armL: 0.75,
        foreL: 0.3,
        thighL: 0.4,
        shinL: -0.28,
        thighR: -0.32,
        shinR: 0.16,
        _hipY: 2.4,
      },
      {
        t: 0.42,
        torso: 0.55,
        neck: 0.28,
        armR: -2.05,
        foreR: 0.45,
        armL: -0.75,
        foreL: 0.2,
        thighL: 0.52,
        shinL: -0.42,
        thighR: -0.42,
        shinR: 0.24,
        footL: 0.14,
        _hipY: 4.2,
      },
      {
        t: 0.68,
        torso: 0.3,
        neck: 0.12,
        armR: -1.35,
        foreR: 0.6,
        armL: -0.3,
        foreL: 0.12,
        thighL: 0.28,
        shinL: -0.16,
        thighR: -0.16,
        _hipY: 2.4,
      },
      {
        t: 1,
        torso: 0.08,
        neck: 0.02,
        armR: -0.4,
        foreR: 0.14,
        armL: 0.08,
        thighL: 0.08,
        thighR: -0.06,
        _hipY: 0.5,
      },
    ],
  },
};

function Lerp(a, b, u) {
  return a + (b - a) * u;
}

function Smoothstep(k) {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
}

/** Sample bone angle offsets at time seconds. */
export function SampleClip(clipName, timeSec) {
  const clip = CLIPS[clipName] || CLIPS.idle;
  const dur = clip.duration || 1;
  const u = ((timeSec % dur) + dur) % dur / dur;
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < u) i += 1;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const k = Smoothstep((u - a.t) / span);
  /** @type {Record<string, number>} */
  const out = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  names.delete("t");
  for (const name of names) {
    out[name] = Lerp(a[name] || 0, b[name] || 0, k);
  }
  return out;
}

export function PickClip(opts) {
  if (opts.melee) return "melee";
  if (opts.digging) return "dig";
  if (opts.crouching) {
    if (Math.abs(opts.vx || 0) > 12 || opts.moving) return "crouchWalk";
    return "crouch";
  }
  if (opts.alert) return "alert";
  if (Math.abs(opts.vx || 0) > 12 || opts.moving) return "walk";
  return "idle";
}

/**
 * Advance clip clock. Walk rate scales with |vx| so strides match travel
 * (avoids moonwalk / skate at crouch or slow speeds).
 * @param {string} clipName
 * @param {number} timeSec
 * @param {number} dt
 * @param {{ vx?: number, refSpeed?: number }} [opts]
 */
export function AdvanceClipTime(clipName, timeSec, dt, opts = {}) {
  const clip = CLIPS[clipName] || CLIPS.idle;
  const dur = clip.duration || 1;
  let rate = 1;
  if (clipName === "walk" || clipName === "crouchWalk") {
    const ref = opts.refSpeed || (clipName === "crouchWalk" ? 120 : 220);
    const speed = Math.abs(opts.vx || 0);
    rate = Math.max(0.38, Math.min(1.35, speed / ref));
  }
  return (((timeSec || 0) + dt * rate) % dur + dur) % dur;
}

/** Tip offset from joint for a bone angle (0 = down / +Y). */
function TipDelta(angle, len) {
  return { x: Math.sin(angle) * len, y: Math.cos(angle) * len };
}

/**
 * Shift skeleton so the lowest foot tip rests on y=0 (no float / bury).
 * @param {Record<string, { x: number, y: number, angle: number }>} world
 */
function PlantFeet(world) {
  let low = -Infinity;
  for (const name of ["footL", "footR"]) {
    const b = world[name];
    const def = BONE_DEFS[name];
    if (!b || !def) continue;
    const tip = TipDelta(b.angle, def.len);
    low = Math.max(low, b.y + tip.y);
  }
  if (!Number.isFinite(low)) return;
  const dy = -low;
  if (Math.abs(dy) < 1e-4) return;
  for (const b of Object.values(world)) {
    b.y += dy;
  }
}

/**
 * World pose for each bone: joint { x, y, angle }.
 * Feet sit at y≈0 when standing; hip near y=-legLen.
 * @param {Record<string, number>} angleOff
 * @param {{ plantFeet?: boolean }} [opts]
 */
export function SolveBones(angleOff, opts = {}) {
  /** @type {Record<string, { x: number, y: number, angle: number }>} */
  const world = {};
  const order = Object.keys(BONE_DEFS);
  const depth = (name, n = 0) => {
    const d = BONE_DEFS[name];
    if (!d || !d.parent) return n;
    return depth(d.parent, n + 1);
  };
  order.sort((a, b) => depth(a) - depth(b));

  // Place hip so feet roughly rest on y=0 at rest pose.
  const standHipY = -(BONE_DEFS.thighL.len + BONE_DEFS.shinL.len + 2);

  for (const name of order) {
    const def = BONE_DEFS[name];
    const local = def.angle + (angleOff[name] || 0);
    if (!def.parent) {
      world[name] = { x: 0, y: 0, angle: local };
      continue;
    }
    if (name === "hip") {
      world[name] = {
        x: 0,
        y: standHipY + (angleOff._hipY || 0),
        angle: local,
      };
      continue;
    }
    const p = world[def.parent];
    const pDef = BONE_DEFS[def.parent];
    const tip = TipDelta(p.angle, pDef.len);
    world[name] = {
      x: p.x + tip.x,
      y: p.y + tip.y,
      angle: p.angle + local,
    };
  }
  if (opts.plantFeet !== false) PlantFeet(world);
  return world;
}

function DrawCapsule(ctx, x, y, angle, len, width, fill, ink, scale) {
  ctx.save();
  ctx.translate(x * scale, y * scale);
  // Local +Y = bone direction (down when angle=0)
  ctx.rotate(-angle);
  const L = len * scale;
  const W = width * scale;
  const r = W * 0.5;
  ctx.fillStyle = fill;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.2, 1.8 * scale);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(-r, L);
  ctx.arc(0, L, r, Math.PI, 0, true);
  ctx.lineTo(r, 0);
  ctx.arc(0, 0, r, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function DrawHead(ctx, x, y, angle, pal, scale, helmet) {
  ctx.save();
  ctx.translate(x * scale, y * scale);
  // head bone points up (≈π); draw face upright
  ctx.rotate(-angle + Math.PI);
  const r = 8 * scale;
  ctx.fillStyle = pal.skin;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.2, 1.8 * scale);
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (helmet || pal.helmet) {
    const cap = helmet || pal.helmet;
    ctx.fillStyle = cap;
    if (pal.helmetKind === "peaked") {
      // 伪军大盖帽 — flat crown + long visor (reads apart from IJA steel pot).
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, -r * 0.95);
      ctx.lineTo(r * 1.05, -r * 0.95);
      ctx.lineTo(r * 1.05, -r * 0.35);
      ctx.lineTo(-r * 1.05, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.25, -r * 0.35);
      ctx.lineTo(r * 1.3, -r * 0.32);
      ctx.lineTo(r * 1.15, -r * 0.05);
      ctx.lineTo(-r * 1.15, -r * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // 日军钢盔 — dome + brim + front star.
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 1.2, r * 0.7, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.28, r * 1.35, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c9a45a";
      ctx.beginPath();
      const sr = r * 0.28;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const b = a + Math.PI / 5;
        const x1 = Math.cos(a) * sr;
        const y1 = -r * 0.55 + Math.sin(a) * sr;
        const x2 = Math.cos(b) * sr * 0.4;
        const y2 = -r * 0.55 + Math.sin(b) * sr * 0.4;
        if (i === 0) ctx.moveTo(x1, y1);
        else ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function DrawBoot(ctx, x, y, angle, pal, scale) {
  ctx.save();
  ctx.translate(x * scale, y * scale);
  ctx.rotate(-angle);
  ctx.fillStyle = pal.boot;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.2, 1.6 * scale);
  ctx.beginPath();
  ctx.ellipse(5 * scale, 1 * scale, 7 * scale, 3.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function DrawHeld(ctx, hand, item, pal, scale, digging) {
  if (!item || !hand) return;
  ctx.save();
  ctx.translate(hand.x * scale, hand.y * scale);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  if (item === "shovel") {
    // Align with bone like capsules (local +Y = bone dir) so the blade follows the chop.
    ctx.rotate(-hand.angle);
    const reach = digging ? 1.35 : 1;
    const shaft = 18 * scale * reach;
    ctx.strokeStyle = "#5a4030";
    ctx.lineWidth = Math.max(1.6, 2.4 * scale);
    ctx.beginPath();
    ctx.moveTo(-6 * scale, 0);
    ctx.lineTo(6 * scale, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, shaft);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = Math.max(1.2, 1.6 * scale);
    ctx.beginPath();
    ctx.moveTo(-7 * scale, shaft - 2 * scale);
    ctx.lineTo(7 * scale, shaft - 2 * scale);
    ctx.lineTo(5 * scale, shaft + 8 * scale);
    ctx.lineTo(0, shaft + 12 * scale);
    ctx.lineTo(-5 * scale, shaft + 8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Legacy +X held items keep the older rotate convention.
    ctx.rotate(hand.angle);
    if (item === "charge") {
      ctx.fillStyle = "#4a3a2a";
      ctx.fillRect(2 * scale, -6 * scale, 12 * scale, 10 * scale);
      ctx.strokeRect(2 * scale, -6 * scale, 12 * scale, 10 * scale);
    } else if (item === "rifle") {
      ctx.fillStyle = "#3a3228";
      ctx.fillRect(2 * scale, -3 * scale, 26 * scale, 5 * scale);
      ctx.strokeRect(2 * scale, -3 * scale, 26 * scale, 5 * scale);
      ctx.fillStyle = "#2a241c";
      ctx.fillRect(22 * scale, -5 * scale, 10 * scale, 3 * scale);
      ctx.fillRect(4 * scale, 1 * scale, 8 * scale, 6 * scale);
    } else if (item === "grenade") {
      ctx.fillStyle = "#5a6a3a";
      ctx.beginPath();
      ctx.arc(8 * scale, 0, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draw a puppet at feet position (x,y) in canvas pixels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   x: number, y: number, facing?: number, scale?: number,
 *   palette?: string|object, clip?: string, time?: number,
 *   hold?: string|null, digging?: boolean, crouching?: boolean,
 *   alpha?: number, moving?: boolean, vx?: number, alert?: boolean,
 * }} opts
 */
export function DrawPuppet(ctx, opts) {
  const facing = opts.facing < 0 ? -1 : 1;
  const scale = opts.scale ?? 1;
  const pal = typeof opts.palette === "string" ? PALETTES[opts.palette] || PALETTES.militia : opts.palette || PALETTES.militia;
  const clip = opts.clip || PickClip(opts);
  const angleOff = SampleClip(clip, opts.time || 0);
  // Dig keeps authored hip drop (chop bite). Crouch / crouchWalk plant so
  // folded knees drop the hip onto planted feet — no fake +hipY hack.
  const bones = SolveBones(angleOff, {
    plantFeet: clip !== "dig",
  });

  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.scale(facing, 1);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

  // Draw order: far limbs first (L), then torso, then R, then head, then held
  const order = [
    "thighL",
    "shinL",
    "footL",
    "armL",
    "foreL",
    "thighR",
    "shinR",
    "footR",
    "torso",
    "armR",
    "foreR",
    "head",
  ];

  for (const name of order) {
    const b = bones[name];
    if (!b) continue;
    const part = PART_ON[name];
    if (!part) continue;
    const fill = pal[part.fill] || part.fill;
    if (part.kind === "head") {
      DrawHead(ctx, b.x, b.y, b.angle, pal, scale, pal.helmet);
    } else if (part.kind === "boot") {
      DrawBoot(ctx, b.x, b.y, b.angle, pal, scale);
    } else {
      DrawCapsule(ctx, b.x, b.y, b.angle, BONE_DEFS[name].len, part.w, fill, pal.ink, scale);
    }
  }

  // neck accent / collar
  const torso = bones.torso;
  if (torso) {
    ctx.save();
    ctx.translate(torso.x * scale, torso.y * scale);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-3 * scale, -4 * scale, 6 * scale, 3 * scale);
    ctx.restore();
  }

  DrawHeld(ctx, bones.handR || bones.foreR, opts.hold, pal, scale, !!opts.digging);
  ctx.restore();
}

export function PaletteForSpeaker(speaker) {
  if (!speaker) return "militia";
  if (/高老忠|赵平原/.test(speaker)) return "elder";
  if (/林霞|大娘/.test(speaker)) return "woman";
  if (/乡亲|小伙/.test(speaker)) return "villager";
  if (/特务|武工/.test(speaker)) return "spy";
  if (/伪军/.test(speaker)) return "puppet";
  if (/鬼子|日军|山田|机枪手/.test(speaker)) return "ijp";
  return "militia";
}
