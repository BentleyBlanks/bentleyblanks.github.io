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
  { id: "home", name: "自己的家", subtitle: "一台电脑，一只冰箱，和全部身家", startX: 0, endX: 10, color: "#3b3553", accent: "#9d8cff" },
  { id: "diner", name: "小菜馆", subtitle: "能吃饱，但梦想要另点", startX: 10, endX: 20, color: "#4b372b", accent: "#ffd166" },
  { id: "market", name: "小超市", subtitle: "小吃、彩票和财务幻觉", startX: 20, endX: 30, color: "#263e3b", accent: "#68e0a0" },
  { id: "talent", name: "人才市场", subtitle: "先买设备，再敢谈梦想", startX: 30, endX: 40, color: "#303a56", accent: "#66b8ff" },
  { id: "bank", name: "银行", subtitle: "未来的你已经签过字了", startX: 40, endX: 50, color: "#3f3447", accent: "#ff6eae" },
  { id: "hotel", name: "大酒店", subtitle: "吃一顿像个人的饭", startX: 50, endX: 60, color: "#493c2c", accent: "#ffb45f" },
  { id: "footbath", name: "普通足浴店", subtitle: "开局唯一亮着的解压灯", startX: 60, endX: 70, color: "#263f43", accent: "#72e0d1" },
  { id: "footbathCity", name: "洗脚城", subtitle: "现金宽裕，焦虑退潮", startX: 70, endX: 80, color: "#39314d", accent: "#c69cff" },
  { id: "maleModelClub", name: "男模店", subtitle: "情绪价值按灯牌计费", startX: 80, endX: 90, color: "#482d43", accent: "#ff86c8" },
]);

// The city is deliberately flat. Jumping remains available for game feel,
// but there are no collectible platforms or moving hazards.
export const Platforms = FreezeList([]);

export const InteractionPoints = FreezeList([
  { id: "homeComputer", kind: "homeComputer", label: "开发电脑", detail: "开发、聊天、宣发、发布、熬到下月", x: 2.35, y: 0, radius: 1.55, action: "computer" },
  { id: "homeFridge", kind: "homeFridge", label: "自己家的冰箱", detail: "看看还能翻出什么", x: 8.1, y: 0, radius: 1.5, action: "homeFood" },
  { id: "dinerCounter", kind: "diner", label: "小菜馆", detail: "点一份便宜充饥套餐", x: 15.1, y: 0, radius: 1.65, action: "sustenance", consumerVenueId: "dinerMeal" },
  { id: "snackShelf", kind: "snackShelf", label: "小超市零食架", detail: "买便宜小吃顶一顶", x: 23.1, y: 0, radius: 1.55, action: "snack", consumerVenueId: "marketSnack" },
  { id: "lotteryCounter", kind: "lotteryMachine", label: "小超市彩票柜台", detail: "刮奖、买彩票、顺便看妖股", x: 27.2, y: 0, radius: 1.55, action: "speculation" },
  { id: "equipmentCounter", kind: "equipmentShop", label: "设备柜台", detail: "电脑、显示器、桌椅：每招一人先有一套", x: 33.1, y: 0, radius: 1.55, action: "equipment" },
  { id: "talentCounter", kind: "talentMarket", label: "人才市场", detail: "雇大学生，或按月租一个 AI", x: 37.1, y: 0, radius: 1.6, action: "talent" },
  { id: "bankCounter", kind: "bank", label: "银行柜台", detail: "还启动贷，或继续抵押家当", x: 45.1, y: 0, radius: 1.75, action: "finance" },
  { id: "hotelRestaurant", kind: "hotel", label: "大酒店餐厅", detail: "花大钱吃顿好的，短暂恢复人形", x: 55.1, y: 0, radius: 1.8, action: "feast", consumerVenueId: "hotelMeal" },
  { id: "regularFootbathCounter", kind: "regularFootbath", label: "普通足浴店", detail: "热水泡脚，缓一口焦虑", x: 65.1, y: 0, radius: 1.75, action: "relaxRegular", consumerVenueId: "regularFootbath" },
  { id: "footbathCityCounter", kind: "footbathCity", label: "洗脚城", detail: "现金够厚，才能整套放空", x: 75.1, y: 0, radius: 1.75, action: "relaxPremium", consumerVenueId: "footbathCity" },
  { id: "maleModelCounter", kind: "maleModelClub", label: "男模店", detail: "高价购买一晚情绪价值", x: 85.1, y: 0, radius: 1.75, action: "relaxLuxury", consumerVenueId: "maleModelClub" },
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
