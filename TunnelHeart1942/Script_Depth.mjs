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
  if (depth === 1) return 1.35;
  return 1.7;
}

export function ScaleOf(depth) {
  if (depth <= -3) return 0.38;
  if (depth === -2) return 0.58;
  if (depth === -1) return 0.78;
  if (depth === 0) return 1;
  if (depth === 1) return 1.38;
  return 1.72;
}

/** Screen Y lift: far sits on the ridge; near drops into the camera skirt. */
export function YLiftOf(depth, scale) {
  if (depth <= -3) return -118 * scale;
  if (depth === -2) return -72 * scale;
  if (depth === -1) return -42 * scale;
  if (depth === 0) return 0;
  if (depth === 1) return 36 * scale;
  return 72 * scale;
}

export function TintAlpha(depth) {
  if (depth <= -3) return 0.42;
  if (depth === -2) return 0.62;
  if (depth === -1) return 0.86;
  if (depth >= 2) return 1;
  if (depth >= 1) return 1;
  return 1;
}

/** Scatter VH-like depth props so every act has back ridge + front occlusion. */
export function SeedDepthDecor(level) {
  const props = level.props || (level.props = []);
  const width = level.width || 2400;
  const night = !!level.palette?.night;

  // FAR — tiny silhouette village on the horizon ridge
  for (let x = 60; x < width; x += 180 + (x % 60)) {
    props.push({ kind: "farHouse", x, depth: DEPTH_FAR, variant: (x / 60) | 0 });
  }
  for (let x = 120; x < width; x += 260) {
    props.push({ kind: "tree", x, depth: DEPTH_FAR, occlude: false });
  }

  // MID — orchard / crop band between horizon and village street
  for (let x = 100; x < width; x += 90 + (x % 40)) {
    props.push({ kind: "wheat", x, depth: DEPTH_MID });
  }
  for (let x = 200; x < width; x += 280 + (x % 70)) {
    props.push({ kind: "tree", x, depth: DEPTH_MID, occlude: false });
  }
  for (let x = 160; x < width; x += 340 + (x % 90)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 120)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_MID });
  }

  // BACK — street buildings sit behind the walk plane (player walks in front)
  for (let x = 180; x < width; x += 300 + (x % 80)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 100)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_BACK });
  }
  for (let x = 90; x < width; x += 200) {
    props.push({ kind: "post", x, depth: DEPTH_BACK });
  }

  // PLAY — roadside clutter on the walk line
  for (let x = 240; x < width; x += 360) {
    if (props.some((p) => Math.abs(p.x - x) < 60 && (p.depth ?? 0) === 0)) continue;
    props.push({ kind: "stack", x, depth: DEPTH_PLAY });
  }

  // FRONT — mid occluders (wheat / bush / post) between player and camera
  for (let x = 50; x < width; x += 110 + (x % 35)) {
    const roll = (x * 17) % 6;
    if (roll === 0) props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: false });
    else if (roll === 1) props.push({ kind: "wheat", x, depth: DEPTH_FRONT });
    else if (roll === 2) props.push({ kind: "post", x, depth: DEPTH_FRONT });
    else if (roll === 3) props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: true });
    else if (roll === 4) props.push({ kind: "stack", x, depth: DEPTH_FRONT });
    else props.push({ kind: "wheat", x: x + 20, depth: DEPTH_FRONT });
  }

  // NEAR — hard occluders only. Continuous ground is painted in Script_Game
  // (no scattered mudbank trapezoids — those read as disconnected floor plates).
  for (let x = 40; x < width; x += 150 + (x % 45)) {
    const roll = (x * 13) % 4;
    if (roll === 0 || roll === 1) props.push({ kind: "bush", x, depth: DEPTH_NEAR, tall: true });
    else if (roll === 2) props.push({ kind: "post", x, depth: DEPTH_NEAR });
    else props.push({ kind: "bush", x, depth: DEPTH_NEAR, tall: true });
  }
  for (let x = 260; x < width; x += 360) {
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
