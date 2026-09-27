// 第一关 05–07 局部地形修饰（战车投掷位 / 背坡集结处 / 南行交通沟）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写；
// 跨区衔接点写在差距文档的分区表里。纯数据，无 import。
export const WHITEBOX_TERRAIN_FRONT = Object.freeze({
  id: "Front0507",
  stages: Object.freeze([5, 6, 7]),
  boxes: Object.freeze([
    // 05：攻击支路、投掷位、战车 Block 停车点与旧院（01–06 空间重排的东半，Data_FirstLevelSpace0106_20260923）。
    Object.freeze({ id: "Tank05", minX: 15, maxX: 65, minZ: -175, maxZ: -100 }),
    // 06：背坡集结处场坪 pad (-36,-100, 26×18) 与西侧反坡。
    Object.freeze({ id: "Collection06", minX: -62, maxX: -15, minZ: -118, maxZ: -84 }),
    // 07：southWalk 中后段到村北口之前（z=-30 以南归村落区）。
    Object.freeze({ id: "South07", minX: -40, maxX: 60, minZ: -84, maxZ: -30 }),
  ]),
  shapes: Object.freeze([]),
});
