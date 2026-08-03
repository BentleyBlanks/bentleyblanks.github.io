/**
 * Touch-pad SVG icons — same ink-on-paper language as DrawPictogram in Script_Game.
 * Kept as markup so DOM buttons match the canvas HUD without letter labels.
 */

const ink = "#1a1410";

function Svg(inner, label) {
  return `<svg class="padIcon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Speech bubble — matches DrawPictogram("talk") */
export const ICON_TALK = Svg(
  `<ellipse cx="16" cy="13" rx="10" ry="7.5" fill="${ink}"/>
   <path d="M12 20 L9 28 L17 22 Z" fill="${ink}"/>`,
);

/** Rifle — matches DrawPictogram("shot") */
export const ICON_SHOT = Svg(
  `<rect x="4" y="14" width="18" height="5" fill="${ink}"/>
   <rect x="18" y="10" width="4" height="13" fill="${ink}"/>
   <rect x="22" y="15" width="6" height="3" fill="${ink}"/>`,
);

/** Shovel — matches DrawPictogram("shovel") */
export const ICON_SHOVEL = Svg(
  `<rect x="14" y="3" width="4" height="16" fill="${ink}"/>
   <path d="M8 20 L24 20 L16 29 Z" fill="${ink}"/>`,
);

/** Hatch / blueprint mark — matches DrawPictogram("hatch") zig */
export const ICON_PLAN = Svg(
  `<rect x="8" y="4" width="16" height="24" fill="none" stroke="${ink}" stroke-width="2.5"/>
   <path d="M11 9 L21 13 L11 17 L21 21 L11 25" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`,
);

/** ADS crosshair */
export const ICON_AIM = Svg(
  `<circle cx="16" cy="16" r="9" fill="none" stroke="${ink}" stroke-width="2.4"/>
   <circle cx="16" cy="16" r="2.2" fill="${ink}"/>
   <path d="M16 4 V9 M16 23 V28 M4 16 H9 M23 16 H28" stroke="${ink}" stroke-width="2.2"/>`,
);

/** Up cursor (design mode aim key) */
export const ICON_UP = Svg(
  `<path d="M16 6 L26 20 H6 Z" fill="${ink}"/>
   <rect x="13" y="18" width="6" height="8" fill="${ink}"/>`,
);

/** Crouch figure */
export const ICON_CROUCH = Svg(
  `<circle cx="16" cy="8" r="4" fill="${ink}"/>
   <path d="M8 28 L12 16 H20 L24 28" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>
   <path d="M10 22 H22" stroke="${ink}" stroke-width="2.4"/>`,
);

/** Move chevrons */
export const ICON_LEFT = Svg(`<path d="M22 6 L10 16 L22 26 Z" fill="${ink}"/>`);
export const ICON_RIGHT = Svg(`<path d="M10 6 L22 16 L10 26 Z" fill="${ink}"/>`);

export const PAD_ICON = {
  left: ICON_LEFT,
  right: ICON_RIGHT,
  crouch: ICON_CROUCH,
  aim: ICON_AIM,
  up: ICON_UP,
  interact: ICON_TALK,
  use: ICON_SHOT,
  dig: ICON_SHOVEL,
  design: ICON_PLAN,
};
