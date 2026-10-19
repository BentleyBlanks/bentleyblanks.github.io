// 白盒预演（docs/Data_EditorBlockout.md §14）额外加载的动作库。纯数据，无 three。
//
// 预演先读开场动作库（Script_OpeningStoryboardAnimation.LoadOpeningStoryboardAnimation），再按这张表逐个读下面的库，
// 用 AddOpeningClipLibrary 把它们的片段并进开场库（骨名数组一致的每一具骨架都并；已有的同名片段不覆盖）。
// 这些库都只烘了参考身体 TengxianNra02：五具 TengxianHumanoidV1 骨架骨名一致，所以国军、日军身体都能播。
// 某个库还没烘出来（清单 404）时预演跳过它、只警告一次，片段退回原生动画（State().missingClips 照常记）。
//
//   name     库名（Animation/<name>/Animation_TengxianNra02<name>.json）
//   base     目录（相对页面）
//   manifest 清单文件名（在 base 下）
//   version  清单版本（取文件时的缓存戳 ?v=）
//
// 片段的作者脚本：_import/Script_Previz<名>Clips.py（PrevizTalk 说话 / 手势，PrevizCare 伤员与拖被子，
// PrevizCombat 国军战斗，PrevizIja 日军），烘焙入口 _import/Script_Previz<名>Bake.py（走开场库的帧循环）。

import { COLLECTION_CARE_ANIMATION } from "./Data_FirstLevelCollectionCare.mjs";

const Previz = name => Object.freeze({
  name,
  base: `./Animation/${name}/`,
  manifest: `Data_${name}Animation.json`,
  version: `20261019${name}V1`,
});

export const BLOCKOUT_PREVIZ_CLIP_LIBRARIES = Object.freeze([
  Previz("PrevizTalk"),
  Previz("PrevizCare"),
  Previz("PrevizCombat"),
  Previz("PrevizIja"),
  // 0610 村子的占位库（百姓 / 妮儿 / 老耿 / 后送兵 / 村里的日军，片段名 Vil 开头；门禁 Script_PrevizVillageClipsTest）
  Previz("PrevizVillage"),
  // 06 集结处的救护库（CareMedicPress / CareMedicBandage / CareLieTreated / CareLieWrithe …）
  Object.freeze({ name: "CollectionCare", ...COLLECTION_CARE_ANIMATION }),
]);

/**
 * 播这些片段时步枪背在背上（手里那把藏起来，背上挂一把）：说话 / 救护这类空手片段。
 * 片段自己带 weapon 道具轨的，道具轨说了算，这张表不管。清单片段上写 `weaponSlung: true` 的也算。
 */
export const PREVIZ_WEAPON_SLUNG = Object.freeze([
  "PvStandTalkSlung",
  // PrevizCare（清单 slungRifle: true）：扒土、铺被子、挪人、拖被子、蹲下抓担架杆
  "PvKneelDig", "PvKneelPullBlanket", "PvKneelHaulBody", "PvBlanketDragL", "PvBlanketDragR", "PvCrouchGripLitter",
  // PrevizCombat（说明表「背枪」）：抱手榴弹捆爬、翻沟、架伤员；被架的机枪手手里也不拿枪
  "PvCrawlCarryBundle", "PvClimbOutTrench", "PvSupportWalkL", "PvSupportWalkR", "PvSupportedHop",
  // CollectionCare：医护包扎 / 按伤口（2026-10-19 起 02末卫生兵用 CareMedicPress）
  "CareMedicPress", "CareMedicBandage",
]);

/**
 * 播这些片段时手里、背上都不显示枪（2026-10-19）：趴着 / 躺着的空手片段。背枪名单那把枪是竖着挂在背后的（开场库 InterrogateCrouch
 * 的挂法），人一趴下就戳上天；这几条干脆不画（Script_EditorBlockoutPuppets 在动作层之后藏）。
 */
export const PREVIZ_WEAPON_HIDDEN = Object.freeze([
  "PvCrawlCarryBundle", "PvLieGrabSleeve",
]);

/**
 * 躺着播的片段（2026-10-19）：顺着躺（lie:"along"）的倒地的人播它们时，运行时照样按头的方向把身子摆顺
 * （Script_EditorBlockoutPuppets 量片段里头 / 骨盆 / 两脚的方向）。0105 PrevizTest 只许被子上的冬瓜播这一类。
 */
export const PREVIZ_LYING_CLIPS = Object.freeze([
  "PvLieGrabSleeve",
]);
