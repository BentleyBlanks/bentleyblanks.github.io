/** TunnelHeart1942 — Valiant Hearts–style one-item carry (not a backpack). */

export const ITEM_NONE = null;
export const ITEM_SHOVEL = "shovel";
export const ITEM_GRENADE = "grenade";
export const ITEM_CHARGE = "charge";

export const ITEM_META = {
  [ITEM_SHOVEL]: {
    id: ITEM_SHOVEL,
    label: "铁锹",
    color: "#8a7355",
    tip: "R 设计蓝图，点 J 开挖已标记格",
  },
  [ITEM_GRENADE]: {
    id: ITEM_GRENADE,
    label: "土制手雷",
    color: "#5a6a3a",
    tip: "投掷：按 F 朝面朝方向扔出",
  },
  [ITEM_CHARGE]: {
    id: ITEM_CHARGE,
    label: "炸药包",
    color: "#4a3a2a",
    tip: "安放：在敌据点旁按 F",
  },
};

export function CanDigWith(held) {
  return held === ITEM_SHOVEL;
}

export function CanThrow(held) {
  return held === ITEM_GRENADE;
}

export function CanPlant(held) {
  return held === ITEM_CHARGE;
}

export function ItemLabel(held) {
  return held && ITEM_META[held] ? ITEM_META[held].label : "空手";
}

export function ItemTip(held) {
  return held && ITEM_META[held] ? ITEM_META[held].tip : "地上有道具就走近按 E 捡起";
}

/** Spawn a world pickup entity. */
export function PickupEntity(x, y, itemId) {
  return {
    kind: "pickup",
    x,
    y,
    w: 22,
    h: 18,
    itemId,
    taken: false,
  };
}
