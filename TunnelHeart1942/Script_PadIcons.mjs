/**
 * Touch-pad icons — transparent Icon_*.png cutouts (ink only, no baked plate).
 * Keep filenames English PascalCase with Icon_ category prefix.
 */

import { CACHE_BUST } from "./Data_Story.mjs";

function ImgIcon(file, label) {
  return `<img class="padIcon" src="./${file}?v=${CACHE_BUST}" alt="" width="32" height="32" draggable="false" aria-hidden="true" data-icon="${label}">`;
}

/** Speech bubble — talk / interact */
export const ICON_TALK = ImgIcon("Icon_Talk.png", "talk");

/** Bolt-action rifle — shoot */
export const ICON_SHOT = ImgIcon("Icon_Shot.png", "shot");

/** Iron shovel — dig */
export const ICON_SHOVEL = ImgIcon("Icon_Shovel.png", "shovel");

/** Blueprint grid + pencil — design / plan */
export const ICON_PLAN = ImgIcon("Icon_Plan.png", "plan");

/** ADS crosshair */
export const ICON_AIM = ImgIcon("Icon_Aim.png", "aim");

/** Up chevron */
export const ICON_UP = ImgIcon("Icon_Up.png", "up");

/** Down chevron (crouch / dig-down) */
export const ICON_DOWN = ImgIcon("Icon_Down.png", "down");

/** Crouched figure — legacy / pictogram parity */
export const ICON_CROUCH = ImgIcon("Icon_Crouch.png", "crouch");

/** Tunnel mouth / cellar hatch with ladder (地道口) */
export const ICON_HATCH = ImgIcon("Icon_TunnelHatch.png", "hatch");

/** Corridor stamp (design mode) */
export const ICON_CORRIDOR = ImgIcon("Icon_Corridor.png", "corridor");

/** Stealth KO fist */
export const ICON_WARN = ImgIcon("Icon_Warn.png", "warn");

/** Stick grenade */
export const ICON_GRENADE = ImgIcon("Icon_Grenade.png", "grenade");

/** Move chevrons */
export const ICON_LEFT = ImgIcon("Icon_Left.png", "left");
export const ICON_RIGHT = ImgIcon("Icon_Right.png", "right");

/** Extra world / HUD plates */
export const ICON_CHARGE = ImgIcon("Icon_Charge.png", "charge");
export const ICON_BELL = ImgIcon("Icon_Bell.png", "bell");
export const ICON_PEOPLE = ImgIcon("Icon_People.png", "people");
export const ICON_FLIP = ImgIcon("Icon_Flip.png", "flip");
export const ICON_CHECK = ImgIcon("Icon_Check.png", "check");
export const ICON_AMMO = ImgIcon("Icon_Ammo.png", "ammo");
export const ICON_RIFLE = ImgIcon("Icon_Rifle.png", "rifle");

/** Head-HUD role glyphs + landmark plates (transparent cutouts). */
export const ICON_ROLE_HERO = ImgIcon("Icon_RoleHero.png", "roleHero");
export const ICON_ROLE_ELDER = ImgIcon("Icon_RoleElder.png", "roleElder");
export const ICON_ROLE_WOMAN = ImgIcon("Icon_RoleWoman.png", "roleWoman");
export const ICON_ROLE_MILITIA = ImgIcon("Icon_RoleMilitia.png", "roleMilitia");
export const ICON_ROLE_ENEMY = ImgIcon("Icon_RoleEnemy.png", "roleEnemy");
export const ICON_ROLE_IJP = ImgIcon("Icon_RoleIjp.png", "roleIjp");
export const ICON_ROLE_PUPPET = ImgIcon("Icon_RolePuppet.png", "rolePuppet");
export const ICON_ROLE_SPY = ImgIcon("Icon_RoleSpy.png", "roleSpy");
export const ICON_WELL = ImgIcon("Icon_Well.png", "well");
export const ICON_BUSH = ImgIcon("Icon_Bush.png", "bush");
export const ICON_HAND_EMPTY = ImgIcon("Icon_HandEmpty.png", "empty");

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
  climb_out: ICON_HATCH,
  corridor: ICON_CORRIDOR,
  warn: ICON_WARN,
  grenade: ICON_GRENADE,
  charge: ICON_CHARGE,
  bell: ICON_BELL,
  people: ICON_PEOPLE,
  flip: ICON_FLIP,
  check: ICON_CHECK,
  ammo: ICON_AMMO,
  rifle: ICON_RIFLE,
  roleHero: ICON_ROLE_HERO,
  roleElder: ICON_ROLE_ELDER,
  roleWoman: ICON_ROLE_WOMAN,
  roleMilitia: ICON_ROLE_MILITIA,
  roleEnemy: ICON_ROLE_ENEMY,
  roleIjp: ICON_ROLE_IJP,
  rolePuppet: ICON_ROLE_PUPPET,
  roleSpy: ICON_ROLE_SPY,
  well: ICON_WELL,
  bush: ICON_BUSH,
  empty: ICON_HAND_EMPTY,
  handEmpty: ICON_HAND_EMPTY,
};

/** All generated plate filenames — smoke / preload. */
export const HUD_ICON_FILES = [
  "Icon_Shovel.png",
  "Icon_TunnelHatch.png",
  "Icon_Talk.png",
  "Icon_Shot.png",
  "Icon_Rifle.png",
  "Icon_Aim.png",
  "Icon_Plan.png",
  "Icon_Up.png",
  "Icon_Down.png",
  "Icon_Left.png",
  "Icon_Right.png",
  "Icon_Warn.png",
  "Icon_Grenade.png",
  "Icon_Charge.png",
  "Icon_Bell.png",
  "Icon_People.png",
  "Icon_Flip.png",
  "Icon_Check.png",
  "Icon_Corridor.png",
  "Icon_Crouch.png",
  "Icon_Ammo.png",
  "Icon_RoleHero.png",
  "Icon_RoleElder.png",
  "Icon_RoleWoman.png",
  "Icon_RoleMilitia.png",
  "Icon_RoleEnemy.png",
  "Icon_RoleIjp.png",
  "Icon_RolePuppet.png",
  "Icon_RoleSpy.png",
  "Icon_Well.png",
  "Icon_Bush.png",
  "Icon_HandEmpty.png",
];

/** Pick pad img for the single contextual interact button. */
export function InteractPadIcon(mode) {
  return PAD_ICON[mode] || ICON_TALK;
}
