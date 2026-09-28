// 关卡按需贴图集（纯数据，零 three）。口径：docs/Data_TextureAssetStandard.md §6「两级加载」。
//
// 开机必需集是 Script_Main 的 PBR_SETS（开机就下、14 MB 红线由 Script_BootPayloadTest 守，已近满额）。
// **新贴图默认进这里**：只在该关建场时由 MaterialLibrary.LoadLevelSets(levelId) 懒加载，
// 每套单独超时、单独失败，失败时保留同名程序化配方（Script_TexBake.RECIPES）或 `fallback` 指的那套已有材质，
// 关卡照常建成。Script_TextureStandardsTest 核对：文件存在、带 ?v= 戳、清单 tier = "level:<levelId>"、
// 每套 ≤ LEVEL_SET_BUDGET_BYTES、每关合计 ≤ LEVEL_TEXTURE_BUDGET_BYTES[levelId]、有可退回的材质。
//
// 条目字段：
//   name      材质库里的名字（library.Get(name) 取用）；不得与 PBR_SETS 重名
//   stem      贴图词干：Texture/Texture_<stem>{Base,Normal,Orm|Orh}.webp（通常与 name 相同）
//   pack      "Orm"（默认）| "none"（只有 Base+Normal，ORM 借 ormFrom 那套）
//   ormFrom   pack 为 "none" 时借谁的 ORM（已烘的配方或开机套名）
//   v         缓存戳（改图就改它；与清单无关，浏览器只认 URL）
//   fallback  下载失败且没有同名程序化配方时，把哪一套已有材质借给 name（开机套名或 RECIPES 名）
//   flipY     默认 true（平铺 PBR）；恢复 glTF 作者 UV atlas 时 false（见 Script_Materials._WrapTexture）

/** 关卡 id 与 Notes/<Level>/、关卡编排工作台同一套（第一关 = "FirstLevel"）。 */
export const LEVEL_TEXTURE_SETS = Object.freeze({
  // 阶段 B（2026-09-28 3A 迭代）各包往这里加条目；现有贴图的加载时机不在此表管理。
  FirstLevel: Object.freeze([
    // B5 开场布景（Data_OpeningSet0103.SET_MATERIALS）：掩蔽部 / 前沟的风化旧木、旧弹药箱板。
    Object.freeze({ name: "OpeningTimber", v: "20260928", fallback: "WoodBeam" }),
    Object.freeze({ name: "OpeningCrate", v: "20260928", fallback: "WoodCrate" }),
  ]),
});

/** 每关按需集合计上限（字节）。第一关 6 MB ≈ 线上 0.5 MB/s 下 12 s，分摊在建场过程里。 */
export const LEVEL_TEXTURE_BUDGET_BYTES = Object.freeze({
  FirstLevel: 6 * 1024 * 1024,
});

/** 单套（Base+Normal+Orm）上限。 */
export const LEVEL_SET_BUDGET_BYTES = 1024 * 1024;

/** 一个条目 → 三（或两）个带戳 URL。纯函数，浏览器与 node 门禁共用。 */
export function LevelTextureSetUrls(entry) {
  const stem = entry.stem || entry.name;
  const v = `?v=${entry.v}`;
  const urls = {
    albedo: `./Texture/Texture_${stem}Base.webp${v}`,
    normal: `./Texture/Texture_${stem}Normal.webp${v}`,
  };
  if ((entry.pack || "Orm") === "Orm") urls.orm = `./Texture/Texture_${stem}Orm.webp${v}`;
  return urls;
}
