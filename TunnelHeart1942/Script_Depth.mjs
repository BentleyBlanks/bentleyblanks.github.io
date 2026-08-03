/**
 * Valiant Hearts–style 2.5D depth planes (punched up).
 * Gameplay stays flat 2D; paint order + parallax + scale + Y-lift + haze
 * sell a diorama stage with real front occlusion.
 *
 * depth < 0  behind play plane (smaller, higher, cooler, slower scroll)
 * depth = 0  play plane (player, interactables)
 * depth > 0  foreground occluders (larger, lower, darker, faster scroll)
 */

export const DEPTH_FAR = -3;
export const DEPTH_MID = -2;
export const DEPTH_BACK = -1;
export const DEPTH_PLAY = 0;
export const DEPTH_FRONT = 1;
export const DEPTH_NEAR = 2;

export function ParallaxOf(depth) {
  if (depth <= -3) return 0.06;
  if (depth === -2) return 0.28;
  if (depth === -1) return 0.58;
  if (depth === 0) return 1;
  // Foreground closer to camera — faster scroll, clearer FRONT vs NEAR gap
  if (depth === 1) return 1.5;
  return 2.05;
}

export function ScaleOf(depth) {
  if (depth <= -3) return 0.38;
  if (depth === -2) return 0.58;
  if (depth === -1) return 0.78;
  if (depth === 0) return 1;
  if (depth === 1) return 1.55;
  return 2.05;
}

/** Screen Y lift: far sits on the ridge; near drops into the camera skirt. */
export function YLiftOf(depth, scale) {
  if (depth <= -3) return -118 * scale;
  if (depth === -2) return -72 * scale;
  if (depth === -1) return -42 * scale;
  if (depth === 0) return 0;
  if (depth === 1) return 54 * scale;
  return 108 * scale;
}

export function TintAlpha(depth) {
  if (depth <= -3) return 0.34;
  if (depth === -2) return 0.62;
  if (depth === -1) return 0.82;
  if (depth >= 2) return 1;
  // FRONT a touch softer so NEAR silhouettes punch as the closest plane
  if (depth >= 1) return 0.9;
  return 1;
}

/** Scatter VH-like depth props — mid band is a real crop field, not a few lonely patches. */
export function SeedDepthDecor(level) {
  const props = level.props || (level.props = []);
  const width = level.width || 2400;
  const night = !!level.palette?.night;

  // FAR — horizon village landmarks only (ridge houses live in the backdrop tooth-row).
  for (let x = 320; x < width; x += 720 + (x % 120)) {
    props.push({ kind: "farHouse", x, depth: DEPTH_FAR, variant: (x / 60) | 0 });
  }
  // Soft far grain haze — reads as distant 麦田, not empty dirt.
  for (let x = 80; x < width; x += 90 + (x % 28)) {
    props.push({
      kind: "wheat",
      x,
      depth: DEPTH_FAR,
      clump: 8 + ((x / 50) | 0) % 4,
      rows: 2,
    });
  }

  // MID — continuous 冀中麦田: overlapping clumps, multi-row patches.
  for (let x = 24; x < width; x += 48 + (x % 16)) {
    props.push({
      kind: "wheat",
      x,
      depth: DEPTH_MID,
      clump: 12 + ((x / 36) | 0) % 6,
      rows: 2 + ((x / 80) | 0) % 2,
    });
  }
  // Orchard / sheds punch holes in the field — keep sparse so crops stay the mass.
  for (let x = 380; x < width; x += 520 + (x % 120)) {
    props.push({ kind: "tree", x, depth: DEPTH_MID, occlude: false });
  }
  for (let x = 300; x < width; x += 580 + (x % 130)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 120)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_MID });
  }

  // BACK — nearer field edge / roadside crop, denser & taller than mid.
  for (let x = 36; x < width; x += 56 + (x % 20)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 70)) continue;
    props.push({
      kind: "wheat",
      x: x + 12,
      depth: DEPTH_BACK,
      clump: 11 + (x % 5),
      rows: 2,
    });
  }
  for (let x = 220; x < width; x += 380 + (x % 90)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 100)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_BACK });
  }
  for (let x = 160; x < width; x += 340) {
    props.push({ kind: "post", x, depth: DEPTH_BACK });
  }

  // PLAY — roadside clutter on the walk line
  for (let x = 280; x < width; x += 420) {
    if (props.some((p) => Math.abs(p.x - x) < 60 && (p.depth ?? 0) === 0)) continue;
    props.push({ kind: "stack", x, depth: DEPTH_PLAY });
  }

  // FRONT — mid-fg skirt: bushes + crop fringe (not a hedge wall)
  for (let x = 100; x < width; x += 220 + (x % 70)) {
    const roll = (x * 17) % 5;
    if (roll <= 1) props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: false });
    else if (roll === 2 || roll === 3) {
      props.push({ kind: "wheat", x, depth: DEPTH_FRONT, clump: 7 + (x % 3), rows: 1 });
    } else props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: true });
  }

  // NEAR — closest camera plane: fewer, bigger punches. Keep distinct from FRONT
  // so two occluder bands still read after thinning. Ground ribbon is Script_Game.
  for (let x = 90; x < width; x += 380 + (x % 90)) {
    const roll = (x * 13) % 3;
    if (roll === 0) props.push({ kind: "bush", x, depth: DEPTH_NEAR, tall: true });
    else if (roll === 1) props.push({ kind: "post", x, depth: DEPTH_NEAR });
    else props.push({ kind: "bush", x, depth: DEPTH_NEAR, tall: false });
  }
  for (let x = 420; x < width; x += 680 + (x % 120)) {
    props.push({ kind: "tree", x: x + 40, depth: DEPTH_NEAR, occlude: true });
  }

  if (night) {
    for (let x = 280; x < width; x += 400) {
      props.push({ kind: "lantern", x, depth: DEPTH_BACK });
    }
  }

  // Ensure authored props sit on a depth band
  for (const p of props) {
    if (p.depth == null) {
      if (p.kind === "house" || p.kind === "blockhouse" || p.kind === "well" || p.kind === "bell") {
        p.depth = DEPTH_BACK; // walk in front of buildings — classic VH
      } else if (p.kind === "tree") {
        p.depth = p.occlude ? DEPTH_NEAR : DEPTH_FRONT;
      } else {
        p.depth = DEPTH_PLAY;
      }
    }
  }
}

export function PropsBehind(props) {
  return (props || []).filter((p) => (p.depth ?? 0) < 0).sort((a, b) => a.depth - b.depth);
}

export function PropsPlay(props) {
  return (props || []).filter((p) => (p.depth ?? 0) === 0);
}

export function PropsFront(props) {
  return (props || []).filter((p) => (p.depth ?? 0) > 0).sort((a, b) => a.depth - b.depth);
}

/** Group behind props by depth band for layered haze between bands. */
export function PropsBehindBands(props) {
  const behind = PropsBehind(props);
  const bands = new Map();
  for (const p of behind) {
    const d = p.depth ?? -1;
    if (!bands.has(d)) bands.set(d, []);
    bands.get(d).push(p);
  }
  return [...bands.entries()].sort((a, b) => a[0] - b[0]);
}
