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
  enemy: {
    tunic: "#3a4630",
    puttee: "#2a3224",
    boot: "#1a1810",
    skin: "#c9b89a",
    accent: "#8b1e1e",
    ink: "#1a1410",
    helmet: "#2a3224",
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
    duration: 1.4,
    keys: [
      { t: 0, torso: 0, armL: 0.05, armR: -0.05, thighL: 0.02, thighR: -0.02 },
      { t: 0.5, torso: 0.03, armL: -0.04, armR: 0.04, thighL: -0.02, thighR: 0.02 },
      { t: 1, torso: 0, armL: 0.05, armR: -0.05, thighL: 0.02, thighR: -0.02 },
    ],
  },
  walk: {
    duration: 0.55,
    keys: [
      {
        t: 0,
        torso: 0.06,
        thighL: 0.55,
        shinL: -0.25,
        thighR: -0.45,
        shinR: 0.15,
        armL: -0.7,
        foreL: 0.2,
        armR: 0.7,
        foreR: -0.15,
      },
      {
        t: 0.5,
        torso: 0.06,
        thighL: -0.45,
        shinL: 0.15,
        thighR: 0.55,
        shinR: -0.25,
        armL: 0.7,
        foreL: -0.15,
        armR: -0.7,
        foreR: 0.2,
      },
      {
        t: 1,
        torso: 0.06,
        thighL: 0.55,
        shinL: -0.25,
        thighR: -0.45,
        shinR: 0.15,
        armL: -0.7,
        foreL: 0.2,
        armR: 0.7,
        foreR: -0.15,
      },
    ],
  },
  crouch: {
    duration: 1.2,
    keys: [
      {
        t: 0,
        hip: 0,
        torso: 0.35,
        thighL: 1.05,
        shinL: -1.35,
        thighR: 0.95,
        shinR: -1.25,
        armL: 0.4,
        armR: -0.35,
        neck: 0.15,
      },
      {
        t: 0.5,
        hip: 0,
        torso: 0.38,
        thighL: 1.0,
        shinL: -1.3,
        thighR: 1.0,
        shinR: -1.3,
        armL: 0.35,
        armR: -0.3,
        neck: 0.18,
      },
      {
        t: 1,
        hip: 0,
        torso: 0.35,
        thighL: 1.05,
        shinL: -1.35,
        thighR: 0.95,
        shinR: -1.25,
        armL: 0.4,
        armR: -0.35,
        neck: 0.15,
      },
    ],
  },
  dig: {
    duration: 0.45,
    keys: [
      {
        t: 0,
        torso: 0.25,
        armR: -1.9,
        foreR: -0.4,
        armL: 0.3,
        thighL: 0.25,
        thighR: -0.15,
      },
      {
        t: 0.45,
        torso: 0.45,
        armR: -0.35,
        foreR: 0.55,
        armL: 0.5,
        thighL: 0.35,
        thighR: -0.05,
      },
      {
        t: 1,
        torso: 0.25,
        armR: -1.9,
        foreR: -0.4,
        armL: 0.3,
        thighL: 0.25,
        thighR: -0.15,
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
};

function Lerp(a, b, u) {
  return a + (b - a) * u;
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
  const k = (u - a.t) / span;
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
  if (opts.digging) return "dig";
  if (opts.crouching) return "crouch";
  if (opts.alert) return "alert";
  if (Math.abs(opts.vx || 0) > 12 || opts.moving) return "walk";
  return "idle";
}

/** Tip offset from joint for a bone angle (0 = down / +Y). */
function TipDelta(angle, len) {
  return { x: Math.sin(angle) * len, y: Math.cos(angle) * len };
}

/**
 * World pose for each bone: joint { x, y, angle }.
 * Feet sit at y≈0 when standing; hip near y=-legLen.
 */
export function SolveBones(angleOff) {
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
    ctx.fillStyle = helmet || pal.helmet;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.5, r * 1.15, r * 0.65, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(-2.2 * scale, -r * 0.85);
    ctx.lineTo(2.2 * scale, -r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
  ctx.rotate(hand.angle);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  if (item === "shovel") {
    ctx.strokeStyle = "#8b6a45";
    ctx.lineWidth = 2.6 * scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(digging ? 18 * scale : 14 * scale, digging ? 8 * scale : 4 * scale);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.fillRect((digging ? 14 : 10) * scale, (digging ? 4 : 0) * scale, 10 * scale, 8 * scale);
    ctx.strokeRect((digging ? 14 : 10) * scale, (digging ? 4 : 0) * scale, 10 * scale, 8 * scale);
  } else if (item === "charge") {
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(2 * scale, -6 * scale, 12 * scale, 10 * scale);
    ctx.strokeRect(2 * scale, -6 * scale, 12 * scale, 10 * scale);
  } else if (item === "grenade") {
    ctx.fillStyle = "#5a6a3a";
    ctx.beginPath();
    ctx.arc(8 * scale, 0, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
  if (opts.crouching) angleOff._hipY = 10;
  const bones = SolveBones(angleOff);

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
  if (/鬼子|山田|巡逻/.test(speaker)) return "enemy";
  return "militia";
}
