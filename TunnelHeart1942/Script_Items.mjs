/** TunnelHeart1942 — Valiant Hearts–style one-item carry (not a backpack). */

export const ITEM_NONE = null;
export const ITEM_SHOVEL = "shovel";
export const ITEM_GRENADE = "grenade";
export const ITEM_CHARGE = "charge";
export const ITEM_RIFLE = "rifle";
/** Ammo packs are auto-absorbed on pickup — never occupied as held slot. */
export const ITEM_AMMO = "ammo";

export const ITEM_META = {
  [ITEM_SHOVEL]: {
    id: ITEM_SHOVEL,
    label: "铁锹",
    color: "#8a7355",
    tip: "贴土壁反复点大键往前挖",
  },
  [ITEM_GRENADE]: {
    id: ITEM_GRENADE,
    label: "土制手雷",
    color: "#5a6a3a",
    tip: "朝面朝方向扔出 · 上抛高弧 · 蹲着近抛",
  },
  [ITEM_CHARGE]: {
    id: ITEM_CHARGE,
    label: "炸药包",
    color: "#4a3a2a",
    tip: "到药室安放",
  },
  [ITEM_RIFLE]: {
    id: ITEM_RIFLE,
    label: "步枪",
    color: "#4a4030",
    tip: "开镜瞄准再打 · 子弹很少",
  },
  [ITEM_AMMO]: {
    id: ITEM_AMMO,
    label: "子弹",
    color: "#6a5a30",
    tip: "走近装进弹袋",
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

export function CanShoot(held) {
  return held === ITEM_RIFLE;
}

export function ItemLabel(held) {
  return held && ITEM_META[held] ? ITEM_META[held].label : "空手";
}

export function ItemTip(held) {
  return held && ITEM_META[held] ? ITEM_META[held].tip : "地上有道具就走近捡起";
}

/** Spawn a world pickup entity. */
export function PickupEntity(x, y, itemId, extras = {}) {
  return {
    kind: "pickup",
    x,
    y,
    w: 22,
    h: 18,
    itemId,
    taken: false,
    ammoAmount: extras.ammoAmount ?? (itemId === ITEM_AMMO ? 3 : 0),
    ...extras,
  };
}
