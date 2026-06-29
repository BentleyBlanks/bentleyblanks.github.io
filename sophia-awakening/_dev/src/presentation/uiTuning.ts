// 可在「UI 编辑器」里实时调的界面尺寸（从硬编码常量抽出来）。改这里 / 拖滑杆即时生效。
// Pixi 绘制的尺寸（卡片 / 手机图标 / 核心）在下一张卡 / 下一帧重绘时套用；CSS 尺寸（边栏 / 智力条）即时套用。
export const UI = {
  cardWidth: 384, // 需求卡片宽
  cardHeight: 162, // 需求卡片基础高（回复卡按内容重算）
  phoneIcon: 62, // 手机内 App 图标方块边长
  phoneSpacing: 94, // 手机内图标间距
  coreRadius: 31, // SOPHIA CORE 半径
  appEmoji: 31, // App 图标 emoji 字号
  leftRail: 286, // 左侧栏宽 (px)
  rightRail: 305, // 右侧栏宽 (px)
  intelBarHeight: 34 // 顶栏智力等级进度条高 (px)
};

export type UIKey = keyof typeof UI;

export const UI_META: Record<UIKey, { label: string; min: number; max: number; step: number }> = {
  cardWidth: { label: "需求卡片 · 宽", min: 280, max: 520, step: 4 },
  cardHeight: { label: "需求卡片 · 基础高", min: 110, max: 240, step: 2 },
  phoneIcon: { label: "手机 App 图标 · 大小", min: 40, max: 84, step: 2 },
  phoneSpacing: { label: "手机 App · 间距", min: 70, max: 120, step: 2 },
  coreRadius: { label: "SOPHIA CORE · 半径", min: 20, max: 48, step: 1 },
  appEmoji: { label: "App emoji · 字号", min: 20, max: 44, step: 1 },
  leftRail: { label: "左侧栏 · 宽", min: 220, max: 380, step: 4 },
  rightRail: { label: "右侧栏 · 宽", min: 220, max: 400, step: 4 },
  intelBarHeight: { label: "智力等级条 · 高", min: 22, max: 56, step: 2 }
};

// 把 CSS 类尺寸写进根元素的自定义属性（边栏宽、智力条高即时生效）。
export function applyUiCss(): void {
  const root = document.documentElement;
  root.style.setProperty("--left-rail", `${UI.leftRail}px`);
  root.style.setProperty("--right-rail", `${UI.rightRail}px`);
  root.style.setProperty("--intel-bar-h", `${UI.intelBarHeight}px`);
}
