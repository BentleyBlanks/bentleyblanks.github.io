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
  if (depth <= -3) return 0.28;
  if (depth === -2) return 0.48;
  if (depth === -1) return 0.78;
  if (depth >= 2) return 1;
  // FRONT a touch softer so NEAR silhouettes punch as the closest plane
  if (depth >= 1) return 0.9;
  return 1;
}

/** Scatter VH-like depth props — far is painted as haze ridges; keep mid/front sparse. */
export function SeedDepthDecor(level) {
  const props = level.props || (level.props = []);
  const width = level.width || 2400;
  const night = !!level.palette?.night;

  // FAR — almost empty: horizon village lives in DrawDepthBackdrop tooth-row + fog.
  // One or two soft landmarks only, never a littered ridge.
  for (let x = 320; x < width; x += 720 + (x % 120)) {
    props.push({ kind: "farHouse", x, depth: DEPTH_FAR, variant: (x / 60) | 0 });
  }

  // MID — crop patches as bands (not stalk-per-metre litter) + sparse orchard
  for (let x = 160; x < width; x += 260 + (x % 60)) {
    props.push({ kind: "wheat", x, depth: DEPTH_MID, clump: 9 });
  }
  for (let x = 300; x < width; x += 440 + (x % 100)) {
    props.push({ kind: "tree", x, depth: DEPTH_MID, occlude: false });
  }
  for (let x = 260; x < width; x += 520 + (x % 110)) {
    if (props.some((p) => p.kind === "house" && Math.abs(p.x - x) < 120)) continue;
    props.push({ kind: "shed", x, depth: DEPTH_MID });
  }

  // BACK — street extras behind the walk plane (authored houses already fill this)
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

  // FRONT — mid-fg skirt: sparse soft cover (bushes / crop), not a hedge wall
  for (let x = 120; x < width; x += 300 + (x % 80)) {
    const roll = (x * 17) % 4;
    if (roll === 0 || roll === 1) props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: false });
    else if (roll === 2) props.push({ kind: "wheat", x, depth: DEPTH_FRONT, clump: 4 });
    else props.push({ kind: "bush", x, depth: DEPTH_FRONT, tall: true });
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
