/**
 * Flat side-scrolling city layout for Studio Survival.
 *
 * The nine named locations are the whole playable world. Business actions live
 * inside believable places instead of appearing as abstract office gates.
 */

const FreezeList = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })));

export const WorldConfig = Object.freeze({
  width: 90,
  height: 9,
  groundY: 0,
  cameraViewportWidth: 14,
  cameraFollowOffset: 7,
  playerWidth: 0.72,
  playerHeight: 1.55,
  moveSpeed: 7,
  jumpSpeed: 9.5,
  gravity: -25,
  interactionRange: 1.65,
  collectibleRadius: 0.45,
  hazardDamageCooldown: 0.9,
  maxHealth: 100,
  hazardDamage: 0,
  spawn: Object.freeze({ x: 2.1, y: 0 }),
});

export const WorldBounds = Object.freeze({
  minX: 0,
  maxX: WorldConfig.width,
  minY: -4,
  maxY: WorldConfig.height,
});

export const Ground = Object.freeze({
  id: "ground",
  x: 0,
  y: WorldConfig.groundY,
  width: WorldConfig.width,
  height: 0.5,
  top: WorldConfig.groundY,
  solid: true,
});

export const Locations = FreezeList([
  { id: "home", name: "自己家", startX: 0, endX: 10, color: "#3b3553", accent: "#9d8cff" },
  { id: "diner", name: "小菜馆", startX: 10, endX: 20, color: "#4b372b", accent: "#ffd166" },
  { id: "market", name: "小超市", startX: 20, endX: 30, color: "#263e3b", accent: "#68e0a0" },
  { id: "talent", name: "人才市场", startX: 30, endX: 40, color: "#303a56", accent: "#66b8ff" },
  { id: "bank", name: "银行", startX: 40, endX: 50, color: "#3f3447", accent: "#ff6eae" },
  { id: "hotel", name: "大酒店", startX: 50, endX: 60, color: "#493c2c", accent: "#ffb45f" },
  { id: "footbath", name: "普通足浴店", startX: 60, endX: 70, color: "#263f43", accent: "#72e0d1" },
  { id: "footbathCity", name: "洗脚城", startX: 70, endX: 80, color: "#39314d", accent: "#c69cff" },
  { id: "maleModelClub", name: "男模店", startX: 80, endX: 90, color: "#482d43", accent: "#ff86c8" },
]);

// The city is deliberately flat. Jumping remains available for game feel,
// but there are no collectible platforms or moving hazards.
export const Platforms = FreezeList([]);

export const InteractionPoints = FreezeList([
  { id: "homeComputer", kind: "homeComputer", label: "电脑", detail: "", x: 2.35, y: 0, radius: 1.55, action: "computer" },
  { id: "homeFridge", kind: "homeFridge", label: "冰箱", detail: "本月吃法", x: 8.1, y: 0, radius: 1.5, action: "homeFood" },
  { id: "dinerCounter", kind: "diner", label: "小菜馆", detail: "充饥套餐", x: 15.1, y: 0, radius: 1.65, action: "sustenance", consumerVenueId: "dinerMeal" },
  { id: "snackShelf", kind: "snackShelf", label: "零食架", detail: "零食", x: 23.1, y: 0, radius: 1.55, action: "snack", consumerVenueId: "marketSnack" },
  { id: "lotteryCounter", kind: "lotteryMachine", label: "刮刮乐", detail: "每月 1 张", x: 27.2, y: 0, radius: 1.55, action: "scratch" },
  { id: "equipmentCounter", kind: "equipmentShop", label: "设备柜台", detail: "每人 1 工位", x: 33.1, y: 0, radius: 1.55, action: "equipment" },
  { id: "talentCounter", kind: "talentMarket", label: "人才市场", detail: "招人", x: 37.1, y: 0, radius: 1.6, action: "talent" },
  { id: "bankCounter", kind: "bank", label: "银行柜台", detail: "还款 / 抵押", x: 45.1, y: 0, radius: 1.75, action: "finance" },
  { id: "hotelRestaurant", kind: "hotel", label: "大酒店餐厅", detail: "大餐", x: 55.1, y: 0, radius: 1.8, action: "feast", consumerVenueId: "hotelMeal" },
  { id: "regularFootbathCounter", kind: "regularFootbath", label: "普通足浴店", detail: "焦虑 -8", x: 65.1, y: 0, radius: 1.75, action: "relaxRegular", consumerVenueId: "regularFootbath" },
  { id: "footbathCityCounter", kind: "footbathCity", label: "洗脚城", detail: "焦虑 -20", x: 75.1, y: 0, radius: 1.75, action: "relaxPremium", consumerVenueId: "footbathCity" },
  { id: "maleModelCounter", kind: "maleModelClub", label: "男模店", detail: "焦虑 -36", x: 85.1, y: 0, radius: 1.75, action: "relaxLuxury", consumerVenueId: "maleModelClub" },
]);

export const Collectibles = FreezeList([]);
export const MovingHazards = FreezeList([]);
export const QuestFragments = Collectibles;

export function FindLocationAt(x) {
  const position = Number.isFinite(Number(x)) ? Number(x) : WorldConfig.spawn.x;
  return Locations.find((location) => position >= location.startX && position < location.endX) || Locations.at(-1);
}

export const WorldData = Object.freeze({
  config: WorldConfig,
  bounds: WorldBounds,
  ground: Ground,
  locations: Locations,
  platforms: Platforms,
  interactions: InteractionPoints,
  collectibles: Collectibles,
  hazards: MovingHazards,
});
