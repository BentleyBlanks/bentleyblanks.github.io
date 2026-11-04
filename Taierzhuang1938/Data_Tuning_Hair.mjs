// 头发 / 胡子的手感数值（docs/Data_HairSystem.md §4–§6）。纯数据、零 import。
// 造型（长短、密度、发色、梳向）在 Hair/Data_HairStyles.json；这里只有着色与远近切档。
export const HAIR_ASSET_VERSION = '20261104a';

export const HAIR_SHADING = Object.freeze({
  // 黑色素 → 底色（UE GetHairColorFromMelanin + ColorFromAbsorption）的吸收倍率，1 = UE 原口径：
  // 黑色素 0.9 以上近乎纯黑（亮度全靠白色主高光 R），0.6 深棕，0.3 浅棕
  melaninScale: 1.0,
  // 发丝带子最少画几个像素宽（真宽是 0.04–0.1 mm，一米外不到 0.1 像素；画宽之外按覆盖率哈希丢弃，TAA 积分）
  minPixels: 1.0,
  // 环境光（SH 探针 + 环境光）乘数；发丝没有真实的天光遮蔽，靠导向发丝的开阔度压暗
  ambient: 1.0,
  // 逆光透射（TT）强度，UE 的 Backlit
  backlit: 1.0,
  // 消光体素的倍率：1 = 按发丝真实截面算的消光；真头发层层叠叠多次散射，体感更「实」，取 2.5
  extinctionScale: 2.5,
  // 发片图集覆盖率倍率（>1 发片更实，<1 更透）
  cardAlphaScale: 1.15,
  // 头发壳程序化条纹的频率（每米多少条，约 1.2 mm 一条）
  shellStreakFrequency: 850,
  // 胡茬一格多大（米）：一格最多一根茬
  stubbleCell: 0.0011,
});

// 远近切档按「头发包围球在屏幕上占多少像素高」算（与分辨率、视角无关的写法 = UE 的 screen size）。
export const HAIR_LOD = Object.freeze({
  hysteresis: 0.08,
  strandsMinPx: 150,        // 头发包围球 ≥ 150 px 高用发丝（1080p、70° 视角下约 1.1 m 以内）
  strandFullPx: 380,        // ≥ 380 px 画全部发丝；150–380 px 之间按比例少画（宽度补偿，覆盖率不变）
  strandMinFraction: 0.35,  // 少画最多少到 35%
  cardsMinPx: 26,           // 26–150 px 发片
  shellMinPx: 6,            // 6–26 px 头发壳；再小就不画头发（头部模型自己的颜色顶着）
  fadeSeconds: 0.25,        // 切档时两档交叉淡入淡出（哈希丢弃，没有半透明排序问题）
  beardCardsMinPx: 18,      // 胡子发片画到多小
  stubbleMinPx: 10,
});

export const HAIR_QUALITY = Object.freeze({ low: 'shell', medium: 'cards', high: 'strands', ultra: 'strands' });
