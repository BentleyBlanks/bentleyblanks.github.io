/**
 * Touch-pad SVG icons — same ink-on-paper language as DrawPictogram in Script_Game.
 * Kept as markup so DOM buttons match the canvas HUD without letter labels.
 */

const ink = "#1a1410";

function Svg(inner) {
  return `<svg class="padIcon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Speech bubble — matches DrawPictogram("talk") */
export const ICON_TALK = Svg(
  `<ellipse cx="16" cy="12" rx="11" ry="8" fill="${ink}"/>
   <path d="M11 19 L8 28 L18 21 Z" fill="${ink}"/>`,
);

/** Rifle — matches DrawPictogram("shot") */
export const ICON_SHOT = Svg(
  `<rect x="3" y="14" width="19" height="5" fill="${ink}"/>
   <rect x="18" y="9" width="4" height="14" fill="${ink}"/>
   <rect x="22" y="15" width="7" height="3" fill="${ink}"/>`,
);

/** Shovel — matches DrawPictogram("shovel") */
export const ICON_SHOVEL = Svg(
  `<rect x="14" y="2" width="4" height="17" fill="${ink}"/>
   <path d="M7 20 L25 20 L16 30 Z" fill="${ink}"/>`,
);

/**
 * Blueprint / design — grid map + pencil.
 * Must read as "画蓝图" at a glance (old zig-zag hatch looked like noise).
 */
export const ICON_PLAN = Svg(
  `<rect x="3" y="3" width="20" height="20" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <path d="M3 10 H23 M3 16 H23 M10 3 V23 M16 3 V23" stroke="${ink}" stroke-width="1.6"/>
   <path d="M18 8 L29 19 L29 26 L22 26 L11 15 Z" fill="${ink}"/>
   <path d="M18 8 L22 4 L26 8 L22 12 Z" fill="${ink}"/>`,
);

/** ADS crosshair */
export const ICON_AIM = Svg(
  `<circle cx="16" cy="16" r="9" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <circle cx="16" cy="16" r="2.2" fill="${ink}"/>
   <path d="M16 4 V9 M16 23 V28 M4 16 H9 M23 16 H28" stroke="${ink}" stroke-width="2.2"/>`,
);

/** Up chevron */
export const ICON_UP = Svg(`<path d="M16 5 L27 20 H5 Z" fill="${ink}"/>`);

/** Down chevron (crouch / dig-down / design cursor) */
export const ICON_DOWN = Svg(`<path d="M16 27 L5 12 H27 Z" fill="${ink}"/>`);

/**
 * Crouch — side-view crouched body + down chevron (kept for smoke / legacy refs).
 */
export const ICON_CROUCH = Svg(
  `<circle cx="20" cy="9" r="3.6" fill="${ink}"/>
   <path d="M18 12 L10 15 L8 22 L14 21 L16 17 L22 20 L24 16 Z" fill="${ink}"/>
   <path d="M8 22 L6 28 M14 21 L12 28 M22 20 L24 28" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>
   <path d="M4 30 L16 24 L28 30" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`,
);

/** Hatch / well lip */
export const ICON_HATCH = Svg(
  `<rect x="4" y="18" width="24" height="6" fill="${ink}"/>
   <path d="M8 18 V10 H24 V18" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <path d="M12 10 V6 H20 V10" fill="none" stroke="${ink}" stroke-width="2"/>`,
);

/** Corridor stamp (design mode) */
export const ICON_CORRIDOR = Svg(
  `<rect x="3" y="12" width="26" height="8" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <path d="M8 16 H24 M14 12 V20 M20 12 V20" stroke="${ink}" stroke-width="2"/>`,
);

/** Stealth / warn slash */
export const ICON_WARN = Svg(
  `<path d="M16 4 L28 26 H4 Z" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <rect x="14.5" y="11" width="3" height="8" fill="${ink}"/>
   <rect x="14.5" y="21" width="3" height="3" fill="${ink}"/>`,
);

/** Move chevrons */
export const ICON_LEFT = Svg(`<path d="M22 5 L9 16 L22 27 Z" fill="${ink}"/>`);
export const ICON_RIGHT = Svg(`<path d="M10 5 L23 16 L10 27 Z" fill="${ink}"/>`);

export const PAD_ICON = {
  left: ICON_LEFT,
  right: ICON_RIGHT,
  crouch: ICON_DOWN,
  down: ICON_DOWN,
  aim: ICON_AIM,
  up: ICON_UP,
  interact: ICON_TALK,
  talk: ICON_TALK,
  use: ICON_SHOT,
  shot: ICON_SHOT,
  dig: ICON_SHOVEL,
  shovel: ICON_SHOVEL,
  design: ICON_PLAN,
  plan: ICON_PLAN,
  hatch: ICON_HATCH,
  corridor: ICON_CORRIDOR,
  warn: ICON_WARN,
};

/** Pick pad SVG for the single contextual interact button. */
export function InteractPadIcon(mode) {
  return PAD_ICON[mode] || ICON_TALK;
}
