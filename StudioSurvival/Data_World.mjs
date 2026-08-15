/**
 * Room-scoped city layout for Studio Survival.
 *
 * Each named location is a discrete interior. The player can walk only inside
 * the current room and must use its exit to choose another destination.
 */

const FreezeList = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })));

export const WorldConfig = Object.freeze({
  width: 144,
  height: 9,
  groundY: 0,
  cameraViewportWidth: 16,
  cameraFollowOffset: 8,
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
  spawn: Object.freeze({ x: 2.8, y: 0, locationId: "home" }),
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
  { id: "home", name: "自己家", startX: 0, endX: 16, entryX: 13.2, color: "#3b3553", accent: "#9d8cff" },
  { id: "diner", name: "小菜馆", startX: 16, endX: 32, entryX: 29.2, color: "#4b372b", accent: "#ffd166" },
  { id: "market", name: "小超市", startX: 32, endX: 48, entryX: 45.2, color: "#263e3b", accent: "#68e0a0" },
  { id: "talent", name: "人才市场", startX: 48, endX: 64, entryX: 61.2, color: "#303a56", accent: "#66b8ff" },
  { id: "bank", name: "银行", startX: 64, endX: 80, entryX: 77.2, color: "#3f3447", accent: "#ff6eae" },
  { id: "hotel", name: "大酒店", startX: 80, endX: 96, entryX: 93.2, color: "#493c2c", accent: "#ffb45f" },
  { id: "footbath", name: "普通足浴店", startX: 96, endX: 112, entryX: 109.2, color: "#263f43", accent: "#72e0d1" },
  { id: "footbathCity", name: "洗脚城", startX: 112, endX: 128, entryX: 125.2, color: "#39314d", accent: "#c69cff" },
  { id: "maleModelClub", name: "男模店", startX: 128, endX: 144, entryX: 141.2, color: "#482d43", accent: "#ff86c8" },
]);

// The city is deliberately flat. Jumping remains available for game feel,
// but there are no collectible platforms or moving hazards.
export const Platforms = FreezeList([]);

export const InteractionPoints = FreezeList([
  { id: "planningBoard", locationId: "home", kind: "planningBoard", label: "项目白板", detail: "开发 / 方向 / 发布", x: 6.3, y: 0, radius: 1.2, action: "direction" },
  { id: "homeCalendar", locationId: "home", kind: "homeCalendar", label: "项目日历", detail: "项目状态 / 进入下月", x: 10.35, y: 0, radius: 1.3, action: "month" },
  { id: "homeFridge", locationId: "home", kind: "homeFridge", label: "冰箱", detail: "选择本月吃法", x: 13.35, y: 0, radius: 1.05, action: "homeFood" },
  { id: "homeExit", locationId: "home", kind: "exit", label: "出门", detail: "选择要去的地方", x: 15.15, y: 0, radius: 1, action: "travel" },
  { id: "dinerCounter", locationId: "diner", kind: "diner", label: "小菜馆", detail: "充饥套餐", x: 23.5, y: 0, radius: 1.65, action: "sustenance", consumerVenueId: "dinerMeal" },
  { id: "dinerExit", locationId: "diner", kind: "exit", label: "出门", detail: "选择要去的地方", x: 31.15, y: 0, radius: 1, action: "travel" },
  { id: "snackShelf", locationId: "market", kind: "snackShelf", label: "零食架", detail: "超市小吃", x: 37.2, y: 0, radius: 1.45, action: "snack", consumerVenueId: "marketSnack" },
  { id: "lotteryCounter", locationId: "market", kind: "lotteryMachine", label: "刮刮乐柜台", detail: "每月限刮一张", x: 42.6, y: 0, radius: 1.45, action: "scratch" },
  { id: "marketExit", locationId: "market", kind: "exit", label: "出门", detail: "选择要去的地方", x: 47.15, y: 0, radius: 1, action: "travel" },
  { id: "equipmentCounter", locationId: "talent", kind: "equipmentShop", label: "设备柜台", detail: "每名员工需 1 套", x: 53.2, y: 0, radius: 1.5, action: "equipment" },
  { id: "talentCounter", locationId: "talent", kind: "talentMarket", label: "人才招聘", detail: "大学生 / AI", x: 59.1, y: 0, radius: 1.55, action: "talent" },
  { id: "talentExit", locationId: "talent", kind: "exit", label: "出门", detail: "选择要去的地方", x: 63.15, y: 0, radius: 1, action: "travel" },
  { id: "bankCounter", locationId: "bank", kind: "bank", label: "银行柜台", detail: "还款 / 抵押", x: 72.1, y: 0, radius: 1.75, action: "finance" },
  { id: "bankExit", locationId: "bank", kind: "exit", label: "出门", detail: "选择要去的地方", x: 79.15, y: 0, radius: 1, action: "travel" },
  { id: "hotelRestaurant", locationId: "hotel", kind: "hotel", label: "大酒店餐厅", detail: "大餐", x: 88.1, y: 0, radius: 1.8, action: "feast", consumerVenueId: "hotelMeal" },
  { id: "hotelExit", locationId: "hotel", kind: "exit", label: "出门", detail: "选择要去的地方", x: 95.15, y: 0, radius: 1, action: "travel" },
  { id: "regularFootbathCounter", locationId: "footbath", kind: "regularFootbath", label: "普通足浴店", detail: "焦虑 -8", x: 104.1, y: 0, radius: 1.75, action: "relaxRegular", consumerVenueId: "regularFootbath" },
  { id: "footbathExit", locationId: "footbath", kind: "exit", label: "出门", detail: "选择要去的地方", x: 111.15, y: 0, radius: 1, action: "travel" },
  { id: "footbathCityCounter", locationId: "footbathCity", kind: "footbathCity", label: "洗脚城", detail: "焦虑 -20", x: 120.1, y: 0, radius: 1.75, action: "relaxPremium", consumerVenueId: "footbathCity" },
  { id: "footbathCityExit", locationId: "footbathCity", kind: "exit", label: "出门", detail: "选择要去的地方", x: 127.15, y: 0, radius: 1, action: "travel" },
  { id: "maleModelCounter", locationId: "maleModelClub", kind: "maleModelClub", label: "男模店", detail: "焦虑 -36", x: 136.1, y: 0, radius: 1.75, action: "relaxLuxury", consumerVenueId: "maleModelClub" },
  { id: "maleModelClubExit", locationId: "maleModelClub", kind: "exit", label: "出门", detail: "选择要去的地方", x: 143.15, y: 0, radius: 1, action: "travel" },
]);

export const Collectibles = FreezeList([]);
export const MovingHazards = FreezeList([]);
export const QuestFragments = Collectibles;

export function FindLocationAt(x) {
  const position = Number.isFinite(Number(x)) ? Number(x) : WorldConfig.spawn.x;
  return Locations.find((location) => position >= location.startX && position < location.endX) || Locations.at(-1);
}

export function FindLocation(locationId) {
  return Locations.find((location) => location.id === locationId) || null;
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
