// 兵种原型（docs/Data_EnemyAi.md §24）：「这是一个什么兵」—— 阵营、默认武器、演员外观、身上的固定标签。
//
// 为什么要有：以前「川军轻机枪手」「日军重机枪手」只存在于各处撒兵代码的参数组合里（side + weapon + towel + actorKind），
// 想知道一共有几种兵、每种兵是什么样，得翻遍撒兵的地方。现在一种兵一行：撒兵可以只写原型编号，个体只覆盖少量差异；
// 不写原型的老写法照旧，AiDirector.Spawn 按「阵营 + 武器类别」认出它属于哪一种，记在 soldier.archetype 上。
// 移植 UE 时一行对应一个兵种 DataAsset。
//
// 纯数据，零 import。武器编号见 Data_Weapons；`weapon: null` = 按士兵身份（MakeSoldierIdentity）从武器池里抽。
//
// 字段：
//   label      中文名
//   side       "nra" | "ija"
//   weapon     默认武器（null = 身份抽）
//   actorKind  演员外观（null = 按阵营：nra / ija；白头巾敢死队由 towel 决定）
//   towel      白头巾（敢死队）
//   unarmed    不持武器

const ARCHETYPE = (spec) => Object.freeze({ weapon: null, actorKind: null, towel: false, unarmed: false, ...spec });

export const SOLDIER_ARCHETYPES = Object.freeze({
  nraRifleman: ARCHETYPE({ label: "川军步枪兵", side: "nra" }),
  nraLmg: ARCHETYPE({ label: "川军轻机枪手", side: "nra", weapon: "Zb26" }),
  nraSword: ARCHETYPE({ label: "川军大刀手", side: "nra", weapon: "Dadao" }),
  nraOfficer: ARCHETYPE({ label: "川军军官", side: "nra", weapon: "ServicePistol" }),
  nraMortar: ARCHETYPE({ label: "川军迫击炮手", side: "nra", weapon: "MediumMortar" }),
  nraDare: ARCHETYPE({ label: "川军敢死队员", side: "nra", towel: true }),
  civilian: ARCHETYPE({ label: "百姓", side: "nra", actorKind: "civilian", unarmed: true }),
  ijaRifleman: ARCHETYPE({ label: "日军步枪兵", side: "ija", weapon: "Type38" }),
  ijaLmg: ARCHETYPE({ label: "日军轻机枪手", side: "ija", weapon: "Type11" }),
  ijaHmg: ARCHETYPE({ label: "日军重机枪手", side: "ija", weapon: "Type92Hmg" }),
  ijaGrenadier: ARCHETYPE({ label: "日军掷弹筒手", side: "ija", weapon: "Type89Launcher" }),
  ijaOfficer: ARCHETYPE({ label: "日军军官", side: "ija", weapon: "OfficerSwordSet" }),
});

/** 不写原型时按「阵营 + 武器类别（Data_Weapons 的 kind）」认原型；没列的类别算步枪兵。 */
export const ARCHETYPE_BY_WEAPON_KIND = Object.freeze({
  nra: Object.freeze({ lmg: "nraLmg", melee: "nraSword", pistol: "nraOfficer", mortar: "nraMortar" }),
  ija: Object.freeze({ lmg: "ijaLmg", hmg: "ijaHmg", mortar: "ijaGrenadier", melee: "ijaOfficer" }),
});
