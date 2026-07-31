/**
 * Valiant Hearts–style 2.5D depth planes.
 * Gameplay stays flat 2D; paint order + parallax + scale fake a diorama stage
 * with real front occlusion (props drawn after the player).
 *
 * depth < 0  behind play plane (smaller, higher, cooler, slower scroll)
 * depth = 0  play plane (player, interactables, main houses)
 * depth > 0  foreground occluders (larger, lower, darker, faster scroll)
 */

export const DEPTH_FAR = -3;
export const DEPTH_BACK = -1;
export const DEPTH_PLAY = 0;
export const DEPTH_FRONT = 1;
export const DEPTH_NEAR = 2;

export function ParallaxOf(depth) {
  if (depth <= -3) return 0.08;
  if (depth === -2) return 0.22;
  if (depth === -1) return 0.55;
  if (depth === 0) return 1;
  if (depth === 1) return 1.25;
  return 1.55;
}

export function ScaleOf(depth) {
  if (depth <= -3) return 0.48;
  if (depth === -2) return 0.62;
  if (depth === -1) return 0.82;
  if (depth === 0) return 1;
  if (depth === 1) return 1.28;
  return 1.55;
}

/** Screen Y lift: far sits higher on the stage ridge; near drops toward camera. */
export function YLiftOf(depth, scale) {
  if (depth <= -3) return -96 * scale;
  if (depth === -2) return -58 * scale;
  if (depth === -1) return -34 * scale;
  if (depth === 0) return 0;
  if (depth === 1) return 28 * scale;
  return 56 * scale;
}

export function TintAlpha(depth) {
  if (depth <= -2) return 0.5;
  if (depth === -1) return 0.78;
  // Front plane must read solid — not a translucent smear
  if (depth >= 1) return 1;
  return 1;
}

/** Scatter VH-like depth props so every act has back ridge + front occlusion. */
export function SeedDepthDecor(level) {
  const props = level.props || (level.props = []);
  const width = level.width || 2400;
  const night = !!level.palette?.night;

  // Far silhouette ridge markers (drawn as tiny houses in back band)
  for (let x = 80; x < width; x += 210 + (x % 70)) {
    props.push({ kind: "farHouse", x, depth: DEPTH_FAR, variant: (x / 70) | 0 });
  }

  // Mid-back orchard / sheds behind the walk plane
  for (let x = 160; x < width; x += 320 + (x % 90)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 100)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_BACK });
  }

  // Play-plane roadside props (same depth as player — no occlusion)
  for (let x = 240; x < width; x += 380) {
    if (props.some((p) => Math.abs(p.x - x) < 60)) continue;
    props.push({ kind: "stack", x, depth: DEPTH_PLAY });
  }

  // FRONT occluders — paint AFTER the player; dense enough to read as 2.5D cover
  for (let x = 70; x < width; x += 130 + (x % 40)) {
    const roll = (x * 13) % 5;
    if (roll === 0) props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: true });
    else if (roll === 1) props.push({ kind: "wheat", x, depth: DEPTH_FRONT });
    else if (roll === 2) props.push({ kind: "post", x, depth: DEPTH_FRONT });
    else if (roll === 3) props.push({ kind: "mudbank", x, depth: DEPTH_NEAR, w: 90 + (x % 50) });
    else props.push({ kind: "bush", x, depth: DEPTH_NEAR, tall: true });
  }

  // Big near trees that clip the player silhouette hard
  for (let x = 280; x < width; x += 380) {
    props.push({ kind: "tree", x: x + 40, depth: DEPTH_NEAR, occlude: true });
  }
  // Extra near mud banks at walk height — undeniable front plane
  for (let x = 150; x < width; x += 260) {
    props.push({ kind: "mudbank", x: x + 30, depth: DEPTH_NEAR, w: 110 });
  }

  if (night) {
    for (let x = 300; x < width; x += 440) {
      props.push({ kind: "lantern", x, depth: DEPTH_BACK });
    }
  }

  // Ensure authored houses sit on a depth band
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
