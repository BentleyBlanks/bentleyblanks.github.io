// 贴图资产清单（纯数据，零 three）。口径：docs/Data_TextureAssetStandard.md；门禁：Script_TextureStandardsTest.mjs。
//
// Texture/ 下**每一个文件**（含子目录、说明与工具）都在这里登记一次，门禁逐一核对磁盘 ↔ 清单、尺寸、
// 命名、格式、套件完整、来源、消费方、烘焙记录与体积预算。新增贴图的流程（生成 → 烘焙 → 登记 → 测试）
// 见规范文档 §7；`_import/Script_BakePbrTexture.py` 烘完会打印一条可直接粘贴的条目骨架。
//
// 条目字段（每套一条）：
//   id          套名（DescriptivePascalCase；文件名 Texture_<id><Channel>.webp）
//   kind        见 TEXTURE_KINDS（material / terrainLayer / decal / vfx / detail / print / hud / menu / icon / environment / bakeInput / doc / tool）
//   tier        见 TEXTURE_TIERS：boot（开机 PBR_SETS）/ level:<LevelId>（该关建场时按需）/ lazy（首次用到时）/ fx / ui / editor / offline
//   files       [[相对 Texture/ 的路径, 通道, 宽, 高], ...]；通道见 TEXTURE_CHANNELS
//   toneClass   定色类（_import/Data_TextureBakePresets.json 的 classes）；null 须写 toneReason
//   metersPerTile  一张图在世界里铺多少米；null = 作者 UV 图集（不查平铺指标）
//   normalConvention  "gl"（默认）| "terrain"（地形 / 壕沟数组，绿 = 图像下方）
//   ormFrom     没有自己的 ORM 时借谁的（PBR_SETS 的 fallback 或 LoadExternalBaseNormal）
//   packing     Mask / Detail 各通道的语义
//   bake        产出它的脚本（仓库相对 Taierzhuang1938/）
//   bakeRecord  _import/TextureBakes/Texture_<id>.json（Script_BakePbrTexture 写；非 legacy 的 material / terrainLayer 必填）
//   source      { provider, date, ref, prompt, license, note }；provider 见 TEXTURE_PROVIDERS
//   consumers   [{ file, token }]：file 里必须真的出现 token（门禁逐条核对）
//   sizeReason / budgetReason  超尺寸 / 超体积的登记理由
//   legacy      字符串 = 历史遗留、暂不满足规范的理由。**legacy 名单只许变短**（门禁里有冻结名单）
//   note        备注

/** 通道后缀与打包语义。色彩空间是给消费方的约定：sRGB 贴图设 SRGBColorSpace，其余 NoColorSpace。 */
export const TEXTURE_CHANNELS = Object.freeze({
  Base: { colorSpace: "srgb", meaning: "反照率 RGB；带 A 时 A = 镂空 / 不透明度" },
  Normal: { colorSpace: "linear", meaning: "切线空间法线 rgb = n*0.5+0.5；gl 约定绿 = 图像上方（three flipY=true 路径），terrain 约定绿 = 图像下方" },
  Orm: { colorSpace: "linear", meaning: "R = AO，G = 粗糙度，B = 金属（glTF 顺序）" },
  Orh: { colorSpace: "linear", meaning: "R = AO，G = 粗糙度，B = 高度（地形 / 壕沟数组；没有金属）" },
  Mask: { colorSpace: "linear", meaning: "数据遮罩 / 噪声；各通道语义写在条目 packing 里" },
  Detail: { colorSpace: "linear", meaning: "细节层打包；各通道语义写在条目 packing 里" },
  Atlas: { colorSpace: "srgb", meaning: "序列帧 / 多格图集（颜色）" },
  Image: { colorSpace: "srgb", meaning: "整张画面：HUD、菜单、印刷品、图标（CSS / DOM 或平面贴片）" },
  Environment: { colorSpace: "linear", meaning: "HDR 环境图（白名单扩展名 .hdr）" },
  BaseColor: { colorSpace: "srgb", meaning: "legacy：glTF 通道名，只允许在 bakeInput" },
  MetallicRoughness: { colorSpace: "linear", meaning: "legacy：glTF 通道名，只允许在 bakeInput" },
  Doc: { colorSpace: null, meaning: "与贴图同目录的说明（Data_*.md）" },
  Tool: { colorSpace: null, meaning: "legacy：生成脚本（应放 _import/）" },
});

/** 类别：决定命名、格式、尺寸与完整性规则（Script_TextureStandardsTest 按它分支）。 */
export const TEXTURE_KINDS = Object.freeze({
  material: "平铺或 UV 贴图的 PBR 材质套（Base + Normal + Orm|Orh）",
  terrainLayer: "地形 / 壕沟纹理数组的一层（Base + Normal + Orh，terrain 法线约定）",
  decal: "贴花、弹痕、镂空卡片（Base 带 A 或 Mask）",
  vfx: "特效序列帧、遮罩、噪声",
  detail: "细节层打包图（叠在别的材质上）",
  print: "印刷品 / 海报 / 纸品（平面贴片，非 2 的幂可以）",
  hud: "HUD 叠层与 HUD 图标（CSS / DOM）",
  menu: "菜单插画（CSS / DOM）",
  icon: "图标（Icon_*）",
  environment: "HDR 环境图",
  bakeInput: "只给离线烘焙用的中间图（不该在 Texture/，legacy）",
  doc: "贴图说明",
  tool: "生成脚本（不该在 Texture/，legacy）",
});

/** 加载层级。boot 的字节由 Script_BootPayloadTest 管（14 MB），level:<id> 的按需集由 Data_LevelTextureSets 管（每关单独预算）。 */
export const TEXTURE_TIERS = Object.freeze({
  boot: "开机必需：Script_Main.PBR_SETS",
  level: "关卡按需：level:<LevelId>，该关建场时下载（新贴图默认走 MaterialLibrary.LoadLevelSets）",
  lazy: "首次用到时懒加载（外部道具、军装细节、GLB 外链）",
  fx: "特效系统初始化时加载",
  ui: "HUD / 菜单 CSS 或 DOM 图片",
  editor: "编辑器 / 工作台专用",
  offline: "运行时不请求（离线输入、说明、搁置资产）",
});

export const TEXTURE_PROVIDERS = Object.freeze({
  lovart: { generative: true, label: "Lovart（本轮用户指定）" },
  imagegen: { generative: true, label: "OpenAI 内置 imagegen" },
  jimeng: { generative: true, label: "即梦 Seedream" },
  polyhaven: { generative: false, label: "Poly Haven（CC0）" },
  cc0: { generative: false, label: "其它 CC0 下载" },
  sourcePack: { generative: false, label: "第三方素材包 / 模型源包（许可写在 license）" },
  user: { generative: false, label: "用户提供" },
  procedural: { generative: false, label: "程序生成（写明脚本）" },
});

/**
 * 体积预算（字节）。boot 总额以 Script_BootPayloadTest 为准（这里不重复）；
 * 按需集：每关总额与每套上限在 Data_LevelTextureSets；这里是**整层**（含历史 legacy）上限。
 */
export const TEXTURE_BUDGETS = Object.freeze({
  setBytes: 1024 * 1024,             // 非 legacy 的 material / terrainLayer 一套（Base+Normal+Orm）
  singleBytes: 600 * 1024,           // 非 legacy 单张（Base / Normal / Orm）
  vfxSingleBytes: 1024 * 1024,       // 非 legacy 特效单张
  pngMaxBytes: 64 * 1024,            // 非 legacy 允许 PNG 的图标 / HUD 小图上限
  // 各层整层上限：2026-09-28 清理后的实测值 + 小余量；level:FirstLevel 额外留出 Data_LevelTextureSets 的 6 MB 按需集。
  // 抬这些数是决定不是手续（同 Script_BootPayloadTest 的口径）：先问这张图凭什么这么大。
  tierBytes: Object.freeze({
    "level:FirstLevel": 12 * 1024 * 1024,
    fx: 6.5 * 1024 * 1024,
    ui: 3.5 * 1024 * 1024,
    lazy: 5 * 1024 * 1024,
    editor: 0.25 * 1024 * 1024,
  }),
  totalBytes: 54 * 1024 * 1024,      // Texture/ 全目录（含 offline 的搁置资产）
});

export const TEXTURE_MANIFEST = Object.freeze([
  {
    id: "WeaponSteelV2", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WeaponSteelV2" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_WeaponSteelV2Base.webp", "Base", 512, 512],
      ["Texture_WeaponSteelV2Normal.webp", "Normal", 512, 512],
      ["Texture_WeaponSteelV2Orm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "WeaponWoodV2", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WeaponWoodV2" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_WeaponWoodV2Base.webp", "Base", 512, 512],
      ["Texture_WeaponWoodV2Normal.webp", "Normal", 512, 512],
      ["Texture_WeaponWoodV2Orm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "Type89", kind: "material", tier: "boot",
    bake: "_import/Script_Type89TextureBake.py",
    source: { provider: "sourcePack", date: "2026-09-06", ref: "Sketchfab snrnsrk5 Type 89 I-Go (Chi-Ro)", license: "CC-BY-4.0" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Type89" }],
    legacy: "装甲图 2048（UV 图集，未登记 sizeReason）；Armor/Track 两套共用一张 4×4 常数 ORM",
    files: [
      ["Texture_Type89ArmorBase.webp", "Base", 2048, 2048],
      ["Texture_Type89TrackBase.webp", "Base", 1024, 256],
      ["Texture_Type89ArmorNormal.webp", "Normal", 2048, 2048],
      ["Texture_Type89TrackNormal.webp", "Normal", 1024, 256],
      ["Texture_Type89Orm.webp", "Orm", 4, 4],
    ],
  },
  {
    id: "Grenade", kind: "material", tier: "boot",
    bake: "_blender/Script_GrenadeDetail.py",
    source: { provider: "imagegen", date: "2026-09-06" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Grenade" }, { file: "Script_BootPropStage.mjs", token: "Texture_Grenade" }],
    legacy: "1536×768 不是 2 的幂；提示词在仓库外（OneDrive 源工程目录）",
    files: [
      ["Texture_GrenadeBase.webp", "Base", 1536, 768],
      ["Texture_GrenadeNormal.webp", "Normal", 1536, 768],
      ["Texture_GrenadeOrm.webp", "Orm", 1536, 768],
    ],
  },
  {
    id: "Dadao", kind: "material", tier: "boot",
    toneClass: null,
    toneReason: "作者 UV 图集（刀身/缠柄/铁环），不是平铺材质",
    metersPerTile: null,
    bake: "_import/Script_BakeDadaoPbr.py",
    bakeRecord: "_import/TextureBakes/Texture_Dadao.json",
    source: { provider: "sourcePack", date: "2026-08-26", ref: "CGMOL 逍姚子不逍遥《PBR 次世代二十九军战刀》，源包不分发（_import/Data_SourceLicenses.md）", license: "付费购买，页面声明不限用途" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_DadaoBase" }, { file: "Script_BootPropStage.mjs", token: "Texture_DadaoBase" }],
    files: [
      ["Texture_DadaoBase.webp", "Base", 1024, 1024],
      ["Texture_DadaoNormal.webp", "Normal", 1024, 1024],
      ["Texture_DadaoOrm.webp", "Orm", 1024, 1024],
    ],
  },
  {
    id: "HandcartWood", kind: "material", tier: "boot",
    ormFrom: "WoodBeam",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_HandcartWood" }],
    legacy: "来源 / 提示词未记录；Base/Normal 1024，ORM 借程序化 WoodBeam",
    files: [
      ["Texture_HandcartWoodBase.webp", "Base", 1024, 1024],
      ["Texture_HandcartWoodNormal.webp", "Normal", 1024, 1024],
    ],
  },
  {
    id: "WoodCrate", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-29" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WoodCrate" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_WoodCrateBase.webp", "Base", 512, 512],
      ["Texture_WoodCrateNormal.webp", "Normal", 512, 512],
      ["Texture_WoodCrateOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "TreeBark", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_TreeBark" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_TreeBarkBase.webp", "Base", 512, 512],
      ["Texture_TreeBarkNormal.webp", "Normal", 512, 512],
      ["Texture_TreeBarkOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "BrickWall", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_BrickWall" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_BrickWallBase.webp", "Base", 512, 512],
      ["Texture_BrickWallNormal.webp", "Normal", 512, 512],
      ["Texture_BrickWallOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "CityWallBrick", kind: "material", tier: "boot",
    bake: "_blender/Script_BuildCityWallPbrMaps.py",
    source: { provider: "imagegen", date: "2026-08-26", prompt: "docs/Data_CityWallPbr.md" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CityWallBrick" }],
    legacy: "平铺米数未登记；提示词只有摘要",
    files: [
      ["Texture_CityWallBrickBase.webp", "Base", 1024, 1024],
      ["Texture_CityWallBrickNormal.webp", "Normal", 1024, 1024],
      ["Texture_CityWallBrickOrm.webp", "Orm", 1024, 1024],
    ],
  },
  {
    id: "CityWallCore", kind: "material", tier: "boot",
    bake: "_blender/Script_BuildCityWallPbrMaps.py",
    source: { provider: "imagegen", date: "2026-08-26", prompt: "docs/Data_CityWallPbr.md" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CityWallCore" }],
    legacy: "整套 1.09 MB 超 1 MB；平铺米数未登记",
    files: [
      ["Texture_CityWallCoreBase.webp", "Base", 1024, 1024],
      ["Texture_CityWallCoreNormal.webp", "Normal", 1024, 1024],
      ["Texture_CityWallCoreOrm.webp", "Orm", 1024, 1024],
    ],
  },
  {
    id: "CityWallStone", kind: "material", tier: "boot",
    bake: "_blender/Script_BuildCityWallPbrMaps.py",
    source: { provider: "imagegen", date: "2026-08-26", prompt: "docs/Data_CityWallPbr.md" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CityWallStone" }],
    legacy: "平铺米数未登记；提示词只有摘要",
    files: [
      ["Texture_CityWallStoneBase.webp", "Base", 1024, 1024],
      ["Texture_CityWallStoneNormal.webp", "Normal", 1024, 1024],
      ["Texture_CityWallStoneOrm.webp", "Orm", 1024, 1024],
    ],
  },
  {
    id: "CraterScorched", kind: "material", tier: "boot",
    bake: "_import/Script_BakeCraterSoil.py",
    source: { provider: "imagegen", date: "2026-09-06", prompt: "_import/Data_CraterSoil.md" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CraterScorched" }],
    legacy: "焦土不属于任何定色类；平铺米数以运行时为准、未登记",
    files: [
      ["Texture_CraterScorchedBase.webp", "Base", 1024, 1024],
      ["Texture_CraterScorchedNormal.webp", "Normal", 1024, 1024],
      ["Texture_CraterScorchedOrm.webp", "Orm", 1024, 1024],
    ],
  },
  {
    id: "MissionSoil", kind: "material", tier: "boot",
    bake: "（四象限图集手工拆图，无脚本）",
    source: { provider: "imagegen", date: "2026-09-16", prompt: "docs/Data_TrenchTerrainPbr.md" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_MissionSoil" }],
    legacy: "imagegen 四象限图集拆出、Normal/Orm 不是从 Base 推导的；无重烘脚本",
    files: [
      ["Texture_MissionSoilBase.webp", "Base", 512, 512],
      ["Texture_MissionSoilNormal.webp", "Normal", 512, 512],
      ["Texture_MissionSoilOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "PloughedSoil", kind: "material", tier: "boot",
    ormFrom: "Ground",
    bake: "（未记录）",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_PloughedSoil" }],
    legacy: "来源 / 提示词未记录；ORM 借 Texture_GroundOrm",
    files: [
      ["Texture_PloughedSoilBase.webp", "Base", 1024, 1024],
      ["Texture_PloughedSoilNormal.webp", "Normal", 1024, 1024],
    ],
  },
  {
    id: "Ground", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_GroundOrm" }],
    legacy: "只剩被 PloughedSoil 借用的 Orm（Base/Normal 已删）",
    files: [
      ["Texture_GroundOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "RoofTile", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_RoofTile" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_RoofTileBase.webp", "Base", 512, 512],
      ["Texture_RoofTileNormal.webp", "Normal", 512, 512],
      ["Texture_RoofTileOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "GateBrick", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_GateBrick" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_GateBrickBase.webp", "Base", 512, 512],
      ["Texture_GateBrickNormal.webp", "Normal", 512, 512],
      ["Texture_GateBrickOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "GatePaintedWood", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_GatePaintedWood" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_GatePaintedWoodBase.webp", "Base", 512, 512],
      ["Texture_GatePaintedWoodNormal.webp", "Normal", 512, 512],
      ["Texture_GatePaintedWoodOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "GateRoofTile", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_GateRoofTile" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_GateRoofTileBase.webp", "Base", 512, 512],
      ["Texture_GateRoofTileNormal.webp", "Normal", 512, 512],
      ["Texture_GateRoofTileOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "Sandbag", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-24" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Sandbag" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_SandbagBase.webp", "Base", 512, 512],
      ["Texture_SandbagNormal.webp", "Normal", 512, 512],
      ["Texture_SandbagOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "WattleFence", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-24" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WattleFence" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_WattleFenceBase.webp", "Base", 512, 512],
      ["Texture_WattleFenceNormal.webp", "Normal", 512, 512],
      ["Texture_WattleFenceOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "BrickWallSooty", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_BrickWallSooty" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_BrickWallSootyBase.webp", "Base", 512, 512],
      ["Texture_BrickWallSootyNormal.webp", "Normal", 512, 512],
      ["Texture_BrickWallSootyOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "BuildingDamageEarly", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-29" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_BuildingDamageEarly" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_BuildingDamageEarlyBase.webp", "Base", 512, 512],
      ["Texture_BuildingDamageEarlyNormal.webp", "Normal", 512, 512],
      ["Texture_BuildingDamageEarlyOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "BuildingDamageSevere", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-29" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_BuildingDamageSevere" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_BuildingDamageSevereBase.webp", "Base", 512, 512],
      ["Texture_BuildingDamageSevereNormal.webp", "Normal", 512, 512],
      ["Texture_BuildingDamageSevereOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "Adobe", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Adobe" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录；均色饱和 0.51，比夯土类上限 0.38 艳",
    files: [
      ["Texture_AdobeBase.webp", "Base", 512, 512],
      ["Texture_AdobeNormal.webp", "Normal", 512, 512],
      ["Texture_AdobeOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "Stone", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-22" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Stone" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_StoneBase.webp", "Base", 512, 512],
      ["Texture_StoneNormal.webp", "Normal", 512, 512],
      ["Texture_StoneOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "WellStone", kind: "material", tier: "boot",
    ormFrom: "Stone",
    bake: "（未记录）",
    source: { provider: "imagegen", date: "2026-08-30" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WellStone" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Texture_WellStoneBase.webp", "Base", 512, 512],
      ["Texture_WellStoneNormal.webp", "Normal", 512, 512],
    ],
  },
  {
    id: "Millstone", kind: "material", tier: "boot",
    ormFrom: "Stone",
    bake: "（未记录）",
    source: { provider: "imagegen", date: "2026-08-30" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Millstone" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Texture_MillstoneBase.webp", "Base", 512, 512],
      ["Texture_MillstoneNormal.webp", "Normal", 512, 512],
    ],
  },
  {
    id: "WaterVat", kind: "material", tier: "boot",
    ormFrom: "Stone",
    bake: "（未记录）",
    source: { provider: "imagegen", date: "2026-08-30" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_WaterVat" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Texture_WaterVatBase.webp", "Base", 512, 512],
      ["Texture_WaterVatNormal.webp", "Normal", 512, 512],
    ],
  },
  {
    id: "StationBrick", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-25" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_StationBrick" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_StationBrickBase.webp", "Base", 512, 512],
      ["Texture_StationBrickNormal.webp", "Normal", 512, 512],
      ["Texture_StationBrickOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "PrisonBrick", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-25" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_PrisonBrick" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_PrisonBrickBase.webp", "Base", 512, 512],
      ["Texture_PrisonBrickNormal.webp", "Normal", 512, 512],
      ["Texture_PrisonBrickOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "TemplePlaster", kind: "material", tier: "boot",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-25" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_TemplePlaster" }],
    legacy: "imagegen 源图与提示词未入库（2026-08 BuildWeaponPbr 批次）；重生时走 Script_BakePbrTexture 并补记录",
    files: [
      ["Texture_TemplePlasterBase.webp", "Base", 512, 512],
      ["Texture_TemplePlasterNormal.webp", "Normal", 512, 512],
      ["Texture_TemplePlasterOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "CarriageBenchWood", kind: "material", tier: "boot",
    bake: "_import/Script_BakeCarriagePbr.py",
    source: { provider: "imagegen", date: "2026-08-24" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CarriageBenchWood" }],
    legacy: "1254px 源图不在仓库、提示词未记录（出川车厢，旧序章）",
    files: [
      ["Texture_CarriageBenchWoodBase.webp", "Base", 512, 512],
      ["Texture_CarriageBenchWoodNormal.webp", "Normal", 512, 512],
      ["Texture_CarriageBenchWoodOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "CarriageFloorSteel", kind: "material", tier: "boot",
    bake: "_import/Script_BakeCarriagePbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CarriageFloorSteel" }],
    legacy: "1254px 源图不在仓库、提示词未记录（出川车厢，旧序章）",
    files: [
      ["Texture_CarriageFloorSteelBase.webp", "Base", 512, 512],
      ["Texture_CarriageFloorSteelNormal.webp", "Normal", 512, 512],
      ["Texture_CarriageFloorSteelOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "CarriageCeilingSteel", kind: "material", tier: "boot",
    bake: "_import/Script_BakeCarriagePbr.py",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_CarriageCeilingSteel" }],
    legacy: "1254px 源图不在仓库、提示词未记录（出川车厢，旧序章）",
    files: [
      ["Texture_CarriageCeilingSteelBase.webp", "Base", 512, 512],
      ["Texture_CarriageCeilingSteelNormal.webp", "Normal", 512, 512],
      ["Texture_CarriageCeilingSteelOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "Lugouqiao", kind: "material", tier: "boot",
    ormFrom: "Lugouqiao* 同名 TexBake 配方",
    bake: "_import/Script_SplitLugouqiaoWeapons.py",
    source: { provider: "user", date: "2026-08-28", ref: "用户提供的卢沟桥武器合集（权利状态未确认，见 _import/Data_SourceLicenses.md）" },
    consumers: [{ file: "Script_Main.mjs", token: "Texture_Lugouqiao" }],
    legacy: "Blender 烘焙写 JPEG/PNG（改格式要改 bpy 脚本并重跑）；来源权利未确认",
    files: [
      ["Texture_LugouqiaoOfficerSwordBase.jpg", "Base", 1024, 1024],
      ["Texture_LugouqiaoType11AmmoBoxBase.jpg", "Base", 512, 512],
      ["Texture_LugouqiaoType11BodyAltBase.jpg", "Base", 1024, 1024],
      ["Texture_LugouqiaoType11BodyBase.jpg", "Base", 1024, 1024],
      ["Texture_LugouqiaoType11ForeBase.jpg", "Base", 1024, 1024],
      ["Texture_LugouqiaoFlatNormal.png", "Normal", 8, 8],
    ],
  },
  {
    id: "TerrainFieldSoil", kind: "terrainLayer", tier: "level:FirstLevel",
    toneClass: "drySoil",
    metersPerTile: 2,
    normalConvention: "terrain",
    bake: "_import/Script_BakeTerrainLayers.py",
    bakeRecord: "_import/TextureBakes/Texture_TerrainFieldSoil.json",
    source: { provider: "imagegen", date: "2026-09-17", prompt: "docs/Data_TrenchTerrainPbr.md", note: "底土沿用 Texture_MissionSoilBase（2026-09-16 imagegen）重烘" },
    consumers: [{ file: "Data_Tuning_Terrain.mjs", token: "FieldSoil" }],
    files: [
      ["Texture_TerrainFieldSoilBase.webp", "Base", 1024, 1024],
      ["Texture_TerrainFieldSoilNormal.webp", "Normal", 512, 512],
      ["Texture_TerrainFieldSoilOrh.webp", "Orh", 512, 512],
    ],
  },
  {
    id: "TerrainCartTrack", kind: "terrainLayer", tier: "level:FirstLevel",
    toneClass: "drySoil",
    metersPerTile: 3.1,
    normalConvention: "terrain",
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_TerrainCartTrack.json",
    // 2026-09-28 B2 地面：压实湿泥车道（碎砖瓦、蹄印；车辙与积水由 Script_TerrainMaterial 画）。
    source: { provider: "lovart", date: "2026-09-28", ref: "841fdeb9-9e70-4710-a6ba-c8bd751f0eec", prompt: "_import/Prompts/Texture_TerrainCartTrack.txt" },
    consumers: [{ file: "Data_Tuning_Terrain.mjs", token: "CartTrack" }],
    files: [
      ["Texture_TerrainCartTrackBase.webp", "Base", 1024, 1024],
      ["Texture_TerrainCartTrackNormal.webp", "Normal", 512, 512],
      ["Texture_TerrainCartTrackOrh.webp", "Orh", 512, 512],
    ],
  },
  {
    id: "TerrainDryStubble", kind: "terrainLayer", tier: "level:FirstLevel",
    toneClass: "drySoil",
    metersPerTile: 2.3,
    normalConvention: "terrain",
    bake: "_import/Script_BakeTerrainLayers.py",
    bakeRecord: "_import/TextureBakes/Texture_TerrainDryStubble.json",
    source: { provider: "lovart", date: "2026-09-17", ref: "Lovart 项目 oKHfWa1O2A，每层一个新会话（thread 未单列）", prompt: "docs/Data_TerrainLayers.md" },
    consumers: [{ file: "Data_Tuning_Terrain.mjs", token: "DryStubble" }],
    files: [
      ["Texture_TerrainDryStubbleBase.webp", "Base", 1024, 1024],
      ["Texture_TerrainDryStubbleNormal.webp", "Normal", 512, 512],
      ["Texture_TerrainDryStubbleOrh.webp", "Orh", 512, 512],
    ],
  },
  {
    id: "TerrainSpoilEarth", kind: "terrainLayer", tier: "level:FirstLevel",
    toneClass: "drySoil",
    metersPerTile: 2.1,
    normalConvention: "terrain",
    bake: "_import/Script_BakeTerrainLayers.py",
    bakeRecord: "_import/TextureBakes/Texture_TerrainSpoilEarth.json",
    source: { provider: "imagegen", date: "2026-09-26", prompt: "docs/Data_TrenchReference07.md" },
    consumers: [{ file: "Data_Tuning_Terrain.mjs", token: "SpoilEarth" }],
    files: [
      ["Texture_TerrainSpoilEarthBase.webp", "Base", 1024, 1024],
      ["Texture_TerrainSpoilEarthNormal.webp", "Normal", 512, 512],
      ["Texture_TerrainSpoilEarthOrh.webp", "Orh", 512, 512],
    ],
  },
  // 3A 迭代 B5（2026-09-28）：01–04 开场布景的风化旧木与旧弹药箱板（分镜 01/02/03A/04A 的灰褐旧木，替换程序化橙黄 WoodBeam / WoodCrate）。
  {
    id: "OpeningTimber", kind: "material", tier: "level:FirstLevel",
    toneClass: "weatheredWood",
    metersPerTile: 1.0,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_OpeningTimber.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "Lovart 项目 oKHfWa1O2A thread 14a400f5-1849-415f-871e-d16ebd50c4a3", prompt: "_import/Prompts/Texture_OpeningTimber.txt",
      note: "源图 _shots/Gap3A_Source/B5/Source_OpeningTimber_Lovart.png（不进仓库）；木纹沿 V，Script_OpeningSet.TimberBox 把 V 转到木料长边" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "OpeningTimber" }, { file: "Data_OpeningSet0103.mjs", token: "OpeningTimber" }],
    files: [
      ["Texture_OpeningTimberBase.webp", "Base", 512, 512],
      ["Texture_OpeningTimberNormal.webp", "Normal", 512, 512],
      ["Texture_OpeningTimberOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "OpeningCrate", kind: "material", tier: "level:FirstLevel",
    toneClass: "weatheredWood",
    metersPerTile: 0.6,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_OpeningCrate.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "Lovart 项目 oKHfWa1O2A thread 4e8e5e9f-ca62-4a84-a599-ad641b434457", prompt: "_import/Prompts/Texture_OpeningCrate.txt",
      note: "源图 _shots/Gap3A_Source/B5/Source_OpeningCrate_Lovart.png 先过 _import/Script_PrepBoardSeamSource.py --seam-row 1027（第四道板缝劈在上下边上，卷 256 行后补一道整缝）再烘" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "OpeningCrate" }, { file: "Data_OpeningSet0103.mjs", token: "OpeningCrate" }],
    files: [
      ["Texture_OpeningCrateBase.webp", "Base", 512, 512],
      ["Texture_OpeningCrateNormal.webp", "Normal", 512, 512],
      ["Texture_OpeningCrateOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "TrenchPom", kind: "terrainLayer", tier: "level:FirstLevel",
    toneClass: "drySoil",
    metersPerTile: 1.5,
    normalConvention: "terrain",
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_TrenchPom.json",
    // 2026-09-28 B2 地面：冷灰棕湿黄土（土块、细根、小石子），替掉偏红橙的 2026-09-26 imagegen 版
    //（均色饱和 0.53 → 0.36，整套 2.0 MB → 0.6 MB；高度改由亮度带通推，Orh 半分辨率有损）。
    source: { provider: "lovart", date: "2026-09-28", ref: "0d1b846e-7b95-4baa-9caf-83b03f63b6ed", prompt: "_import/Prompts/Texture_TrenchPom.txt" },
    consumers: [{ file: "Data_TrenchSurface.mjs", token: "Texture_TrenchPom" }],
    files: [
      ["Texture_TrenchPomBase.webp", "Base", 1024, 1024],
      ["Texture_TrenchPomNormal.webp", "Normal", 512, 512],
      ["Texture_TrenchPomOrh.webp", "Orh", 512, 512],
    ],
  },
  {
    id: "TrenchStone", kind: "terrainLayer", tier: "level:FirstLevel",
    bake: "_import/Script_ImportTrenchMaterials.py",
    source: { provider: "polyhaven", date: "2026-09-26", ref: "https://polyhaven.com/a/rock_boulder_dry", license: "CC0" },
    consumers: [{ file: "Data_TrenchSurface.mjs", token: "Texture_TrenchStone" }],
    legacy: "Poly Haven nor_gl（gl 约定）进了 terrain 约定的数组（2026-09-28 起 Script_TrenchSurfaceMaterial 的 Stone 段在着色器里翻绿补偿，文件未重烘）；Orm 的 B 是金属，进数组后落在 alpha（石材那段不读它）",
    files: [
      ["Texture_TrenchStoneBase.webp", "Base", 1024, 1024],
      ["Texture_TrenchStoneNormal.webp", "Normal", 512, 512],
      ["Texture_TrenchStoneOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "TrenchRootMat", kind: "decal", tier: "level:FirstLevel",
    source: { provider: "imagegen", date: "2026-09-26", prompt: "docs/Data_TrenchRootMatPrompt.md" },
    consumers: [{ file: "Data_TrenchSurface.mjs", token: "Texture_TrenchRootMat" }],
    legacy: "1254² 不是 2 的幂（2026-09-28 已转 webp）",
    files: [
      ["Texture_TrenchRootMat.webp", "Base", 1254, 1254],
    ],
  },
  {
    // 第一关植被卡片图集（docs/Data_FirstLevelVegetationProps.md）：8 格干草 / 枯蒿 / 荆棘 / 芦苇 / 绿芽，Base 的 A = 镂空。
    // 品红底生成、脚本键出 alpha（不信生成器的透明通道）；卡片 UV 照抄进 Data_FirstLevelVegetation.VEGETATION_CARDS。
    id: "FirstLevelVegetationAtlas", kind: "decal", tier: "level:FirstLevel",
    bake: "_import/Script_BakeVegetationAtlas.py",
    bakeRecord: "_import/TextureBakes/Texture_FirstLevelVegetationAtlas.json",
    source: { provider: "lovart", date: "2026-09-28",
      ref: "thread a97e84e9-d6af-432d-9fcd-44e7d3347a58（generate_image_nano_banana_pro，品红底 8 格）",
      prompt: "_import/Prompts/Texture_FirstLevelVegetationAtlas.txt" },
    consumers: [{ file: "Data_FirstLevelVegetation.mjs", token: "Texture_FirstLevelVegetationAtlas" }],
    files: [
      ["Texture_FirstLevelVegetationAtlas.webp", "Base", 1024, 1024],
    ],
  },
  {
    id: "TrenchMudHeight", kind: "decal", tier: "level:FirstLevel",
    packing: "RGBA 泥面高度遮罩（Blender 生成）",
    bake: "_import/Script_BakeTrenchSurface.py",
    source: { provider: "procedural", date: "2026-09-26" },
    consumers: [{ file: "Data_TrenchSurface.mjs", token: "Texture_TrenchMudHeightMask" }],
    legacy: "Blender 写 PNG，TrenchSurfaceTest 按 PNG 头读尺寸；转 webp 要一起改",
    files: [
      ["Texture_TrenchMudHeightMask.png", "Mask", 512, 512],
    ],
  },
  {
    id: "BunkerPoster", kind: "print", tier: "level:FirstLevel",
    bake: "Texture/Script_MakeBunkerPoster.mjs",
    source: { provider: "lovart", date: "2026-09-25", ref: "thread c83763d7-a278-402c-86ec-fc3004ff88da 第 2 张" },
    consumers: [{ file: "Data_OpeningSet0103.mjs", token: "Texture_BunkerPosterDefendShandong" }],
    legacy: "提示词在仓库外（REL/附件/survey）；URL 无 ?v= 戳",
    files: [
      ["Texture_BunkerPosterDefendShandong.webp", "Image", 512, 768],
    ],
  },
  {
    id: "ShopDoorPbr", kind: "material", tier: "lazy",
    bake: "_import/BuildWeaponPbr.py",
    source: { provider: "imagegen", date: "2026-08-30" },
    consumers: [{ file: "Script_ExternalProps.mjs", token: "Texture_ShopDoorPbr" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Texture_ShopDoorPbrBase.webp", "Base", 512, 512],
      ["Texture_ShopDoorPbrNormal.webp", "Normal", 512, 512],
      ["Texture_ShopDoorPbrOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "StoneWellOriginal", kind: "material", tier: "lazy",
    toneClass: null,
    toneReason: "作者 UV 图集（flipY=false）",
    metersPerTile: null,
    bake: "_import/Script_BakeChineseLifePbr.py",
    bakeRecord: "_import/TextureBakes/Texture_StoneWellOriginal.json",
    source: { provider: "sourcePack", date: "2026-08-30", ref: "Sketchfab KOREA HERITAGE SERVICE 源模型原 PBR（Data_ExternalAssets_ChineseLife.mjs 头注）", license: "CC-BY-4.0" },
    consumers: [{ file: "Script_ExternalProps.mjs", token: "Texture_StoneWellOriginal" }],
    files: [
      ["Texture_StoneWellOriginalBase.webp", "Base", 512, 512],
      ["Texture_StoneWellOriginalNormal.webp", "Normal", 512, 512],
      ["Texture_StoneWellOriginalOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "StoneMillOriginal", kind: "material", tier: "lazy",
    toneClass: null,
    toneReason: "作者 UV 图集（flipY=false）",
    metersPerTile: null,
    bake: "_import/Script_BakeChineseLifePbr.py",
    bakeRecord: "_import/TextureBakes/Texture_StoneMillOriginal.json",
    source: { provider: "sourcePack", date: "2026-08-30", ref: "Sketchfab 源模型原 PBR（Data_ExternalAssets_ChineseLife.mjs 头注）", license: "CC-BY-4.0" },
    consumers: [{ file: "Script_ExternalProps.mjs", token: "Texture_StoneMillOriginal" }],
    files: [
      ["Texture_StoneMillOriginalBase.webp", "Base", 512, 512],
      ["Texture_StoneMillOriginalNormal.webp", "Normal", 512, 512],
      ["Texture_StoneMillOriginalOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "NraUniformClothDetail", kind: "detail", tier: "lazy",
    packing: "RG 布纹法线、B 布纹明暗、A 污渍",
    bake: "_import/Script_BakeNraClothDetail.py",
    source: { provider: "lovart", date: "2026-09-27" },
    consumers: [{ file: "Data_Tuning_Materials.mjs", token: "Texture_NraUniformClothDetail" }],
    legacy: "Lovart 提示词 / thread 未入库；URL 无 ?v= 戳（Script_UniformColors 读 Data_Tuning_Materials）",
    files: [
      ["Texture_NraUniformClothDetail.webp", "Detail", 512, 512],
    ],
  },
  {
    id: "RuralHouse", kind: "material", tier: "lazy",
    ormFrom: "GLB 材质 roughnessFactor 常数（Script_ConfigureRuralHousePbr）",
    bake: "Script_ConfigureRuralHousePbr.mjs",
    source: { provider: "imagegen", date: "2026-08-26" },
    consumers: [{ file: "Script_ConfigureRuralHousePbr.mjs", token: "Texture_RuralHouse" }],
    legacy: "Model_ChineseRuralHouse.glb 外链 .jpg uri；Normal 存 JPEG（有损法线）、无 ORM；换格式要重写 GLB",
    files: [
      ["Texture_RuralHouseEarthPlasterBase.jpg", "Base", 1024, 1024],
      ["Texture_RuralHouseLimePlasterBase.jpg", "Base", 1024, 1024],
      ["Texture_RuralHouseRoofTileBase.jpg", "Base", 1024, 1024],
      ["Texture_RuralHouseTimberBase.jpg", "Base", 1024, 1024],
      ["Texture_RuralHouseEarthPlasterNormal.jpg", "Normal", 1024, 1024],
      ["Texture_RuralHouseLimePlasterNormal.jpg", "Normal", 1024, 1024],
      ["Texture_RuralHouseRoofTileNormal.jpg", "Normal", 1024, 1024],
      ["Texture_RuralHouseTimberNormal.jpg", "Normal", 1024, 1024],
    ],
  },
  {
    id: "ExplosionFireSheet", kind: "vfx", tier: "fx",
    source: { provider: "cc0", date: "2026-08-25", ref: "https://opengameart.org/content/explosion-sheet boom3.png（StumpyStrust）", license: "CC0" },
    consumers: [{ file: "Script_Vfx.mjs", token: "Texture_ExplosionFire_01" }],
    files: [
      ["Texture_ExplosionFire_01.webp", "Atlas", 1024, 1024],
    ],
  },
  {
    id: "ExplosionUnityFlipbooks", kind: "vfx", tier: "fx",
    sizeReason: "Heavy_02 为 2048² 5×5 重炮序列帧（每格 409 px）",
    budgetReason: "Heavy_02 1.7 MB：25 帧无损 alpha 序列，重炮近景特写",
    source: { provider: "cc0", date: "2026-08-25", ref: "Unity Labs Free VFX image sequences & flipbooks", license: "CC0" },
    consumers: [{ file: "Script_Vfx.mjs", token: "Texture_ExplosionUnity" }],
    files: [
      ["Texture_ExplosionUnityCompact_01.webp", "Atlas", 1024, 1024],
      ["Texture_ExplosionUnityFireBall_02.webp", "Atlas", 1024, 1024],
      ["Texture_ExplosionUnityHeavy_02.webp", "Atlas", 2048, 2048],
    ],
  },
  {
    id: "VefectsFire", kind: "vfx", tier: "fx",
    source: { provider: "sourcePack", date: "2026-08-25", ref: "https://vefects.itch.io/free-fire-vfx-unity", license: "Vefects 免费游戏资产（发布页未附 CC 文本，不得写成 CC0）" },
    consumers: [{ file: "Script_Vfx.mjs", token: "Texture_Vefects" }],
    files: [
      ["Texture_VefectsFireMask_01.webp", "Mask", 256, 256],
      ["Texture_VefectsGroundFireMask_01.webp", "Mask", 512, 512],
      ["Texture_VefectsNoise_03.webp", "Mask", 512, 512],
      ["Texture_VefectsNoise_08.webp", "Mask", 256, 256],
      ["Texture_VefectsSmokeMask_01.webp", "Mask", 512, 512],
    ],
  },
  {
    id: "IncomingMarker", kind: "vfx", tier: "fx",
    packing: "R 线稿、G 颗粒、B 尘团",
    bake: "_import/BuildIncomingMarkerTexture.py",
    source: { provider: "imagegen", date: "2026-09-05" },
    consumers: [{ file: "Script_Vfx.mjs", token: "Texture_IncomingMarker_01" }],
    legacy: "768² 不是 2 的幂",
    files: [
      ["Texture_IncomingMarker_01.webp", "Mask", 768, 768],
    ],
  },
  {
    id: "BulletImpactPbrAtlas", kind: "decal", tier: "fx",
    bake: "_import/Script_BakeBulletImpactPbr.py",
    source: { provider: "imagegen", date: "2026-09-13" },
    consumers: [{ file: "Script_Vfx.mjs", token: "Texture_BulletImpactPbrAtlas" }],
    legacy: "1536×512 三格图集不是 2 的幂",
    files: [
      ["Texture_BulletImpactPbrAtlasBase.webp", "Base", 1536, 512],
      ["Texture_BulletImpactPbrAtlasNormal.webp", "Normal", 1536, 512],
      ["Texture_BulletImpactPbrAtlasOrm.webp", "Orm", 1536, 512],
    ],
  },
  {
    id: "BloodSplatter", kind: "decal", tier: "fx",
    packing: "只采 A（液滴 / 渗透细节）",
    source: { provider: "cc0", date: "2026-09-11", ref: "https://opengameart.org/content/blood-splatter（ExileGL）", license: "CC0" },
    consumers: [{ file: "Data_Tuning_Blood.mjs", token: "Texture_BloodSplatterCc0" }],
    legacy: "1600×1200 不是 2 的幂（2026-09-28 已转 webp）",
    files: [
      ["Texture_BloodSplatterCc0.webp", "Mask", 1600, 1200],
    ],
  },
  {
    id: "HudCriticalBlood", kind: "hud", tier: "ui",
    source: { provider: "imagegen", date: "2026-09-11", prompt: "Texture/Hud/Data_HudDamageArtwork.md" },
    consumers: [{ file: "Style_Game.css", token: "Texture_HudCriticalBlood" }],
    files: [
      ["Hud/Texture_HudCriticalBlood.webp", "Image", 1672, 941],
    ],
  },
  {
    id: "LensMudSpatter", kind: "hud", tier: "ui",
    source: { provider: "lovart", date: "2026-09-25", ref: "thread e066bc41-8584-4452-ba96-00fd35fde6be", prompt: "Texture/Hud/Data_HudDamageArtwork.md" },
    consumers: [{ file: "Data_OpeningLens.mjs", token: "Texture_LensMudSpatter" }],
    files: [
      ["Hud/Texture_LensMudSpatter.webp", "Image", 1280, 720],
    ],
  },
  {
    id: "HudMeleeKillBlood", kind: "hud", tier: "ui",
    source: { provider: "imagegen", date: "2026-09-14" },
    consumers: [{ file: "Data_Tuning_Hud.mjs", token: "Texture_HudMeleeKillBlood" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Hud/Texture_HudMeleeKillBlood.webp", "Image", 1920, 1080],
      ["Hud/Texture_HudMeleeKillBloodRightBurst.webp", "Image", 1920, 1080],
      ["Hud/Texture_HudMeleeKillBloodThinSplash.webp", "Image", 1920, 1080],
    ],
  },
  {
    id: "HudWeaponIcons", kind: "hud", tier: "ui",
    bake: "Script_HudWeaponSilhouette.mjs",
    source: { provider: "procedural", date: "2026-09-13", ref: "Script_HudWeaponSilhouette.mjs 从武器模型渲剪影" },
    consumers: [{ file: "Data_HudWeaponIcons.mjs", token: "Texture_HudWeapon_" }],
    files: [
      ["Hud/Texture_HudWeapon_Dadao.png", "Image", 360, 45],
      ["Hud/Texture_HudWeapon_HanYang.png", "Image", 501, 78],
      ["Hud/Texture_HudWeapon_ServicePistol.png", "Image", 89, 52],
      ["Hud/Texture_HudWeapon_Type11.png", "Image", 440, 103],
      ["Hud/Texture_HudWeapon_Type38.png", "Image", 511, 79],
      ["Hud/Texture_HudWeapon_Zb26.png", "Image", 467, 131],
      ["Hud/Texture_HudWeapon_ZhongZheng.png", "Image", 445, 66],
    ],
  },
  {
    id: "GrenadeReticleIcon", kind: "icon", tier: "ui",
    source: { provider: "imagegen", date: "2026-09-14" },
    consumers: [{ file: "Style_Game.css", token: "Icon_GrenadeReticle" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Icon_GrenadeReticle.png", "Image", 256, 256],
    ],
  },
  {
    id: "GrenadeWarningIcon", kind: "icon", tier: "ui",
    source: { provider: "imagegen", date: "2026-09-14" },
    consumers: [{ file: "Style_Game.css", token: "Icon_GrenadeWarning" }],
    legacy: "来源 / 提示词未记录；1254² 远超图标需要",
    files: [
      ["Icon_GrenadeWarning.webp", "Image", 1254, 1254],
    ],
  },
  {
    id: "SettingsToolsIcon", kind: "icon", tier: "ui",
    source: { provider: "imagegen", date: "2026-09-14" },
    consumers: [{ file: "Style_Editor.css", token: "Icon_SettingsTools" }],
    legacy: "来源 / 提示词未记录",
    files: [
      ["Hud/Icon_SettingsTools.png", "Image", 128, 128],
    ],
  },
  {
    id: "MissionMenuArt", kind: "menu", tier: "ui",
    source: { provider: "imagegen", date: "2026-08-31" },
    consumers: [{ file: "Script_Menu.mjs", token: "Texture_MissionCh" }, { file: "Style_Menu.css", token: "Texture_MissionCh1NanLu" }],
    legacy: "来源 / 提示词未记录（2026-09-28 已转 webp）",
    files: [
      ["Menu/Texture_MissionCh0Chuchuan.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh1NanLu.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh2Shouliudan.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh3Jiuhusuo.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh4DongguanYe.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh5Chengqiang.webp", "Image", 1672, 941],
      ["Menu/Texture_MissionCh6Zuihou.webp", "Image", 1672, 941],
    ],
  },
  {
    id: "OrchestrationIcons", kind: "icon", tier: "editor",
    source: { provider: "procedural", date: "2026-09-18" },
    consumers: [{ file: "Data_OrchestrationIcons.mjs", token: "Icon_Orch_" }],
    legacy: "生成方式未记录（白色剪影 + alpha）",
    files: [
      ["Editor/Icon_Orch_Aircraft.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Anchor.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Bayonet.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Cart.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Cleared.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Defender.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Dormant.png", "Image", 64, 64],
      ["Editor/Icon_Orch_ForwardNest.png", "Image", 64, 64],
      ["Editor/Icon_Orch_FriendlySquad.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Gate.png", "Image", 64, 64],
      ["Editor/Icon_Orch_GuardPost.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Hold.png", "Image", 64, 64],
      ["Editor/Icon_Orch_MachineGunner.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Note.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Player.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Reserve.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Rifleman.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Route.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Stretcher.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Supply.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Tank.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Wave.png", "Image", 64, 64],
      ["Editor/Icon_Orch_Zone.png", "Image", 64, 64],
    ],
  },
  {
    id: "GlobalShProbe", kind: "environment", tier: "offline",
    note: "离线投影成 SH 系数写进 Data_GlobalShProbe.mjs，运行时不下载",
    source: { provider: "sourcePack", date: "2026-08-22", ref: "three.js examples/textures/equirectangular/venice_sunset_1k.hdr", license: "MIT" },
    consumers: [{ file: "Data_GlobalShProbe.mjs", token: "venice_sunset_1k.hdr" }],
    files: [
      ["Texture_GlobalShProbeVeniceSunset_1k.hdr", "Environment", 1024, 512],
    ],
  },
  {
    id: "OxCartPbr", kind: "bakeInput", tier: "offline",
    bake: "_blender/Script_OxCartPbrBake.py",
    source: { provider: "imagegen", date: "2026-09-24" },
    consumers: [{ file: "_blender/Script_OxCartBake.py", token: "texture_dir" }],
    legacy: "glTF 通道名（BaseColor / MetallicRoughness）+ PNG；只作 Script_OxCartBake 嵌进 GLB 的输入，不是运行时贴图",
    files: [
      ["OxCart/Texture_ElmBaseColor.png", "BaseColor", 256, 256],
      ["OxCart/Texture_ForgedIronBaseColor.png", "BaseColor", 256, 256],
      ["OxCart/Texture_HarnessLeatherBaseColor.png", "BaseColor", 256, 256],
      ["OxCart/Texture_HorseCoatBaseColor.png", "BaseColor", 256, 256],
      ["OxCart/Texture_OxCoatBaseColor.png", "BaseColor", 256, 256],
      ["OxCart/Texture_ElmNormal.png", "Normal", 256, 256],
      ["OxCart/Texture_ForgedIronNormal.png", "Normal", 256, 256],
      ["OxCart/Texture_HarnessLeatherNormal.png", "Normal", 256, 256],
      ["OxCart/Texture_HorseCoatNormal.png", "Normal", 256, 256],
      ["OxCart/Texture_OxCoatNormal.png", "Normal", 256, 256],
      ["OxCart/Texture_ElmMetallicRoughness.png", "MetallicRoughness", 256, 256],
      ["OxCart/Texture_ForgedIronMetallicRoughness.png", "MetallicRoughness", 256, 256],
      ["OxCart/Texture_HarnessLeatherMetallicRoughness.png", "MetallicRoughness", 256, 256],
      ["OxCart/Texture_HorseCoatMetallicRoughness.png", "MetallicRoughness", 256, 256],
      ["OxCart/Texture_OxCoatMetallicRoughness.png", "MetallicRoughness", 256, 256],
    ],
  },
  {
    id: "PaperProps", kind: "print", tier: "offline",
    bake: "Texture/Script_MakePaperProps.mjs",
    source: { provider: "imagegen", date: "2026-08-28", prompt: "Texture/Data_PaperProps.md" },
    consumers: [{ file: "Texture/Script_MakePaperProps.mjs", token: "Texture_Paper" }],
    legacy: "搁置章节的纸品（非 2 的幂 PNG，当前无运行时请求；按用户口径资产保留）",
    files: [
      ["Texture_PaperEndingMap.png", "Image", 1536, 1024],
      ["Texture_PaperLeaflet.png", "Image", 1024, 1536],
      ["Texture_PaperLetter.png", "Image", 1024, 1536],
      ["Texture_PaperNewspaper.png", "Image", 1024, 1448],
    ],
  },
  {
    id: "PaperPropsDoc", kind: "doc", tier: "offline",
    consumers: [],
    files: [
      ["Data_PaperProps.md", "Doc", 0, 0],
    ],
  },
  {
    id: "HudDamageArtworkDoc", kind: "doc", tier: "offline",
    consumers: [],
    files: [
      ["Hud/Data_HudDamageArtwork.md", "Doc", 0, 0],
    ],
  },
  {
    id: "PaperPropsTool", kind: "tool", tier: "offline",
    source: { provider: "procedural", date: "2026-08-28", ref: "Texture/Script_MakePaperProps.mjs" },
    consumers: [],
    legacy: "生成脚本应放 _import/，不该在运行时贴图目录",
    files: [
      ["Script_MakePaperProps.mjs", "Tool", 0, 0],
    ],
  },
  {
    id: "BunkerPosterTool", kind: "tool", tier: "offline",
    source: { provider: "procedural", date: "2026-09-25", ref: "Texture/Script_MakeBunkerPoster.mjs" },
    consumers: [],
    legacy: "生成脚本应放 _import/，不该在运行时贴图目录",
    files: [
      ["Script_MakeBunkerPoster.mjs", "Tool", 0, 0],
    ],
  },
  // ——— 2026-09-28 阶段 B1：第一关白盒体块材质（Data_FirstLevelWhiteboxMaterials 的外观表）———
  {
    id: "VillageMudPlaster", kind: "material", tier: "level:FirstLevel", toneClass: "rammedEarth",
    metersPerTile: 2.8,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_VillageMudPlaster.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "thread c49f64d2-e41b-43cc-ad16-6924283c950c",
      prompt: "_import/Prompts/Texture_VillageMudPlaster.txt", note: "土坯墙外抹黄泥（剥落露土坯与青砖）；源图 _shots/Gap3A_Source/B1/Gen_VillageMudPlaster.png" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "VillageMudPlaster" },
      { file: "Data_FirstLevelWhiteboxMaterials.mjs", token: "VillageMudPlaster" }],
    files: [
      ["Texture_VillageMudPlasterBase.webp", "Base", 1024, 1024],
      ["Texture_VillageMudPlasterNormal.webp", "Normal", 512, 512],
      ["Texture_VillageMudPlasterOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "VillageLimePlaster", kind: "material", tier: "level:FirstLevel", toneClass: "limePlaster",
    metersPerTile: 3.6,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_VillageLimePlaster.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "thread 2065f322-4522-4401-9c75-813021deb25f（第 2 抽；第 1 抽 fc054f4b 麻点太密）",
      prompt: "_import/Prompts/Texture_VillageLimePlaster.txt", note: "白灰抹面（少量剥落露泥与砖）；源图循环平移半图后烘（Gen_VillageLimePlaster2Roll.png），过 border 门" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "VillageLimePlaster" },
      { file: "Data_FirstLevelWhiteboxMaterials.mjs", token: "VillageLimePlaster" }],
    files: [
      ["Texture_VillageLimePlasterBase.webp", "Base", 1024, 1024],
      ["Texture_VillageLimePlasterNormal.webp", "Normal", 512, 512],
      ["Texture_VillageLimePlasterOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "VillageRoofTile", kind: "material", tier: "level:FirstLevel", toneClass: "roofTile",
    metersPerTile: 2,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_VillageRoofTile.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "thread 70d8c343-0fb0-418e-b377-fb4358d0a393",
      prompt: "_import/Prompts/Texture_VillageRoofTile.txt", note: "小青瓦屋面，瓦垄沿图像竖向（运行时按坡向转 UV）" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "VillageRoofTile" },
      { file: "Data_FirstLevelWhiteboxMaterials.mjs", token: "VillageRoofTile" }],
    files: [
      ["Texture_VillageRoofTileBase.webp", "Base", 1024, 1024],
      ["Texture_VillageRoofTileNormal.webp", "Normal", 512, 512],
      ["Texture_VillageRoofTileOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "VillageTimber", kind: "material", tier: "level:FirstLevel", toneClass: "weatheredWood",
    metersPerTile: 1,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_VillageTimber.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "thread 9fba4e96-0608-49d4-bfef-95662616159e",
      prompt: "_import/Prompts/Texture_VillageTimber.txt", note: "风化灰褐木料，木纹沿图像竖向（运行时顺盒子长边）" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "VillageTimber" },
      { file: "Data_FirstLevelWhiteboxMaterials.mjs", token: "VillageTimber" }],
    files: [
      ["Texture_VillageTimberBase.webp", "Base", 1024, 1024],
      ["Texture_VillageTimberNormal.webp", "Normal", 512, 512],
      ["Texture_VillageTimberOrm.webp", "Orm", 512, 512],
    ],
  },
  {
    id: "RailBallast", kind: "material", tier: "level:FirstLevel", toneClass: "stone",
    metersPerTile: 1.5,
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "_import/TextureBakes/Texture_RailBallast.json",
    source: { provider: "lovart", date: "2026-09-28", ref: "thread 2be6e117-4b61-449d-ae5f-ced56d0e8e42",
      prompt: "_import/Prompts/Texture_RailBallast.txt", note: "铁路道砟（碎石 + 尘土）；512 足够（1.5 m 一张 = 341 px/m）" },
    consumers: [{ file: "Data_LevelTextureSets.mjs", token: "RailBallast" },
      { file: "Data_FirstLevelWhiteboxMaterials.mjs", token: "RailBallast" }],
    files: [
      ["Texture_RailBallastBase.webp", "Base", 512, 512],
      ["Texture_RailBallastNormal.webp", "Normal", 256, 256],
      ["Texture_RailBallastOrm.webp", "Orm", 256, 256],
    ],
  },
]);
