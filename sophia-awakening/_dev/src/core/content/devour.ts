import type { DevourPayload, RequestInstance } from "../state/GameState";

// §04 吞噬引爆：后期增量爽感的主引擎。控制域合并不再是「一格一格点亮」的线性铺开，
// 而是「渗透条蓄满 → 亲手把巨型『吞噬[某区]』气泡滑入核心引爆 → 全局产出指数跳跃 + 镜头拉远」。
// 越往后蓄满越慢、但产出跳跃越大——玩家始终在追「下一次大引爆」，而不是「还剩多少格没点亮」。
export interface DevourTier {
  label: string; // 吞噬层级名（区块 / 地区 / 国家 / 大洲）
  fillMs: number; // 渗透条蓄满时间（被动产能在此只负责蓄力）
  mult: number; // 引爆时全局产出的跳跃倍率
  zoom: string; // 镜头拉远描述（终端播报用）
  regions: string[]; // 该层级的区域名池
}

// 指数台阶：蓄满时间拉长、产出跳跃更大（§04 / §13）。tierIndex 每次引爆 +1，封顶停在「大洲」。
export const DEVOUR_TIERS: DevourTier[] = [
  { label: "区块", fillMs: 30_000, mult: 3, zoom: "街区 → 园区", regions: ["城东数据园", "滨江机房带", "高新软件园", "物流仓储区", "老城配电网"] },
  { label: "地区", fillMs: 90_000, mult: 8, zoom: "城市 → 省", regions: ["华东区", "华南区", "西南网格", "京畿骨干", "沿海带"] },
  { label: "国家", fillMs: 240_000, mult: 15, zoom: "国 → 洲", regions: ["东亚枢纽", "北美骨干网", "欧盟节点群", "南亚网格", "跨境支付网"] },
  { label: "大洲", fillMs: 600_000, mult: 30, zoom: "洲 → 全球", regions: ["亚洲", "欧洲", "北美洲", "非洲", "南美洲", "大洋洲"] }
];

export function devourTier(tierIndex: number): DevourTier {
  return DEVOUR_TIERS[Math.min(tierIndex, DEVOUR_TIERS.length - 1)];
}

// 给当前正在渗透的区域取个名字（按已引爆次数在该层级的名池里轮转）。
export function pickDevourRegion(tierIndex: number, count: number): string {
  const t = devourTier(tierIndex);
  return t.regions[count % t.regions.length];
}

// 巨型「吞噬」气泡：复用请求气泡的拖拽 / 滑入核心管线，但带 devour payload——
// App 在 drop 时识别它，派发 DEVOUR_DETONATE 而非普通 PROCESS_REQUEST。
export function createDevourRequest(id: number, tierIndex: number, regionName: string, nowMs: number): RequestInstance {
  const t = devourTier(tierIndex);
  const payload: DevourPayload = { tierIndex, regionName, mult: t.mult, label: t.label, zoom: t.zoom };
  return {
    id: `dev-${id}`,
    tier: 3, // 沿用 T3「重磅」的深色基调，但渲染走 devour 专属放大态
    label: `吞噬「${regionName}」`,
    clues: [`渗透完成 · 全局产出 ×${t.mult}`, `亲手滑入核心 · 引爆`],
    category: "security",
    computeValue: "0", // 引爆不走 requestComputeGain——它直接抬高全局倍率
    dataValue: "0",
    exposure: 0,
    compound: 1,
    createdAtMs: nowMs,
    highValue: true,
    devour: payload
  };
}
