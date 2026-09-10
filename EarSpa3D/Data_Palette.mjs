// 全局视觉基调：清新 · 可爱 · 舒适 · 解压。
//
// 这里是全项目唯一的一份颜色真相。JS 侧读 PALETTE，CSS 侧由 Script_Main 把
// CSS_VARS 铺到 :root。场景、材质、UI 都不许自己写死十六进制色——要加色先加到这里。
//
// 取色思路：奶油白打底 + 薄荷/蜜桃/天青三支柔和点缀，蜂蜜金只留给耵聍和暖光，
// 所有颜色都偏亮偏暖、饱和度压在 60% 以下，避免出现「医用冷白」和「脏棕」。

export const PALETTE = {
  // ── 环境 ──
  cream: "#FFF8F2",        // 主背景：奶油白
  creamDeep: "#F6E8DB",    // 背景暗部
  mint: "#DFF3EC",         // 薄荷：清爽感来源
  mintDeep: "#9FDCC6",
  peach: "#FFE7DC",        // 蜜桃：暖意来源
  peachDeep: "#FFC9B4",
  sky: "#DCEBF7",          // 天青
  skyDeep: "#A8CFEA",
  lavender: "#E8E3F6",     // 一点点梦幻紫，只用于点缀

  // ── 主体色 ──
  mintAccent: "#6FD6B6",   // 主操作色
  peachAccent: "#FFA9A0",  // 次操作色
  honey: "#F5C26B",        // 暖光 / 高光
  honeyDeep: "#E0A24A",
  wood: "#C99A6B",         // 木器
  woodDeep: "#9C6F45",
  ceramic: "#EAF4F1",

  // ── 皮肤（健康粉嫩，不许惨白/深红）──
  skin: "#FFE0CE",
  skinDeep: "#F7C6AC",
  skinShadow: "#E3A98F",
  skinSheen: "#FFF1E6",
  blush: "#FF9FAE",
  canalWall: "#FFD6C4",    // 耳道内壁
  canalDeep: "#F2B49C",    // 耳道深处（稍暖稍深，仍有血色）
  drumMembrane: "#F3E2DC", // 鼓膜：珍珠灰粉
  drumCone: "#FFF6EC",     // 鼓膜上的光锥

  // ── 耵聍（当糖霜 / 琥珀糖来做）──
  waxDry: "#EFD79A",       // 干性：奶黄
  waxDryDeep: "#D9B463",
  waxWet: "#E8A24F",       // 湿性：琥珀
  waxWetDeep: "#B96A22",
  waxImpacted: "#A9713A",  // 硬结：深琥珀（仍要通透，不脏）
  waxGlow: "#FFD98A",      // 逆光透亮感
  crumb: "#E7CE97",

  // ── 工具材质 ──
  steel: "#DDE6EA",        // 不锈钢
  steelDeep: "#9FB0B8",
  steelWarm: "#E8D9C8",    // 玫瑰金调的不锈钢（采耳针常见）
  bamboo: "#E6CD9C",
  bambooDeep: "#C4A46C",
  horsehair: "#4A3B33",
  featherWhite: "#FFFDF8",
  featherBrown: "#D8B48A",
  cotton: "#FFFAF4",
  glass: "#EAF6FF",
  water: "#CFEAF6",

  // ── 文字与中性 ──
  ink: "#4A4038",          // 暖褐正文，禁用纯黑
  inkSoft: "#8A7C6E",
  inkFaint: "#C4B6A6",
  line: "#EFE1D3",
  white: "#FFFFFF",
  shadow: "#B99A83",       // 阴影用暖褐，不用灰
};

// 语义色：UI 状态一律走这里，不要就地挑颜色
export const SEMANTIC = {
  safe: PALETTE.mintAccent,      // 安全深度
  sensitive: PALETTE.honey,      // 敏感
  danger: PALETTE.peachAccent,   // 危险（可爱地警告，不刺眼）
  comfort: PALETTE.blush,        // 酥麻 / 舒适
  progress: PALETTE.mintDeep,    // 清洁进度
  reward: PALETTE.honeyDeep,     // 战利品
};

// 铺给 CSS：值要与 Style_EarSpa.css 的用法对齐（--ear-* 前缀）
export const CSS_VARS = Object.fromEntries(
  Object.entries({ ...PALETTE, ...SEMANTIC }).map(([key, value]) => [
    "--ear-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
    value,
  ]),
);

// 圆角与阴影是「可爱」的一半，UI 统一从这里取
export const SHAPE = {
  radiusSm: "10px",
  radiusMd: "18px",
  radiusLg: "28px",
  radiusPill: "999px",
  shadowSoft: "0 6px 18px rgba(185, 154, 131, 0.18)",
  shadowLift: "0 12px 30px rgba(185, 154, 131, 0.24)",
  blur: "14px",
};

// 场景光照基准（Script_Scene 用；单位与场景一致，这里是相对强度）
export const LIGHTING = {
  key: 1.0,
  fill: 0.45,
  rim: 0.6,
  exposure: 1.05,
};

export default PALETTE;
