// 第一关 05–07 局部地形修饰（战车投掷位 / 背坡集结处 / 南行交通沟）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写；
// 跨区衔接点写在差距文档的分区表里。纯数据，无 import。
//
// 2026-09-27 按 Notion「第一关｜游戏概念参考图」06/06B、07/07B 重做（区 A）：
//   06 集结处整片下沉到交通沟沟底高度（natural −1.8），做成「背坡洼地」：
//      老周靠墙位、借火位、担架、搬运员与 collection 锚点全落在同一平面；北、西两面
//      是约 3 m 的背坡（1.8 m 下沉 + 1.2 m 土台，北侧再接 Layout 的 CollectionBackslopeWest），
//      东面同样抬 1.2 m，成 06B 左手的 3 m 土壁；南缘是 CollectionLitterWall 那道低土壁。
//      交通沟（西南口、东北 SJ 方向）沟底本来就在 −1.8，直接接进洼地；southWalk 从东南角
//      走一条 9.4 m 的缓坡回到地面。
//   07 沿 southWalk 第 3–5 点真实下挖交通沟（差距文档 §1 07 方案 a）：底宽 3.4、沟底比地面低
//      1.7 m，两侧抛土 0.35 m（沟壁连抛土约 2.05 m），两端逐点 dy 0 做进出坡；z −34.2 回到地面
//      （A↔B 衔接：A 的沟在 z ≥ −34 前回到 0 m）。路线坐标不动：沟中线在 (−16,−52)→(−6,−32)
//      这一段往东偏 0.5 m，让西壁让开 Aftermath7_0 那具遗体（遗体落在沟沿上而不是沟壁上）。
//   05 只动体块（Data_FirstLevelWhiteboxFront）：投掷位 K8/K9 视线、战车路线、护送坑都被 01–06
//      门禁锁着，路面与路肩不下沉也不抬高。
const Pt = (x, z, dy) => Object.freeze(dy === undefined ? { x, z } : { x, z, dy });

export const WHITEBOX_TERRAIN_FRONT = Object.freeze({
  id: "Front0507",
  stages: Object.freeze([5, 6, 7]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  paths: Object.freeze([]),
  boxes: Object.freeze([
    // 05：攻击支路、投掷位、战车 Block 停车点与旧院（01–06 空间重排的东半，Data_FirstLevelSpace0106_20260923）。
    Object.freeze({ id: "Tank05", minX: 15, maxX: 65, minZ: -175, maxZ: -100 }),
    // 06：背坡集结处场坪 pad (-36,-100, 26×18) 与西侧反坡。
    Object.freeze({ id: "Collection06", minX: -62, maxX: -15, minZ: -118, maxZ: -84 }),
    // 07：southWalk 中后段到村北口之前（z=-30 以南归村落区）。
    Object.freeze({ id: "South07", minX: -40, maxX: 60, minZ: -84, maxZ: -30 }),
  ]),
  shapes: Object.freeze([
    // ── 06 背坡洼地 ───────────────────────────────────────────────────────────
    // 场坪下沉到沟底：西缘 x −46、北缘 z −107.5、东缘 x −27、南缘 z −95（CollectionLitterWall 的北脚）。
    // 东北角斜切，给 SJ→collection 那段交通沟与后沿横沟之间留一道土梁；东南角斜切给出坡。
    Object.freeze({ id: "CollectionHollow", kind: "polygon", op: "level", dy: -1.9, feather: 1.0,
      points: Object.freeze([Pt(-46, -107.5), Pt(-35.5, -107.5), Pt(-29, -104), Pt(-27, -101.5),
        Pt(-27, -97.5), Pt(-30.5, -95), Pt(-46, -95)]),
      note: "06 背坡洼地：场坪 = 交通沟沟底（natural −1.8），老周/借火/担架/搬运员同一平面" }),
    // 出坡：从洼地东南角沿 southWalk 回到地面。只从洼地边缘起坡，洼地里面不起土埂。
    Object.freeze({ id: "CollectionHollowRamp", kind: "line", op: "level", halfW: 2.0, feather: 1.2, dy: -1.9,
      points: Object.freeze([Pt(-30.8, -96.2, -1.9), Pt(-26, -92, -0.5), Pt(-24.4, -89.4, 0)]),
      note: "06→07 出坡：9.4 m 升 1.8 m（坡度 ≤ 0.21），底宽 4 m，担架队并排上坡" }),
    // 北背坡：洼地北缘外抬 1.2 m 的土台，北边接 Layout 的 CollectionBackslopeWest（再高 3 m）。
    // 东端停在 x −36.5（+羽化 1.0）：SJ→collection 的交通沟在 x −34…−30，不能被抬。
    Object.freeze({ id: "CollectionNorthBank", kind: "box", op: "raise", dy: 1.2, feather: 1.0,
      x: -43.5, z: -111.875, w: 14, d: 4.75,
      note: "06 北背坡上半截：洼地底 −1.8 → 土台 +1.2（3 m 土壁），土台北接 CollectionBackslopeWest" }),
    // 西背坡：同样 1.2 m 的土台（替代旧的 CollectionWestReturn/WestFoot 两块土色箱），外侧再一层 0.7 m 缓坡。
    Object.freeze({ id: "CollectionWestBank", kind: "box", op: "raise", dy: 1.2, feather: 1.0,
      x: -49.25, z: -102, w: 4.5, d: 16,
      note: "06 西背坡：3 m 土壁（下半截由 Front 体块包的石砌挡土墙收边）" }),
    Object.freeze({ id: "CollectionWestBankOuter", kind: "box", op: "raise", dy: 0.7, feather: 2.5,
      x: -53.75, z: -102.5, w: 4.5, d: 16,
      note: "西背坡外侧缓坡：从 1.2 m 的坡顶退到田面，不留一道竖崖" }),
    // 东侧高地：洼地东壁再抬 1.2 m，成 06B 左手的 3 m 土壁，并顺 southWalk 出坡的左手（东）延伸到 z −85.5。
    // 西南边线是 southWalk (−26,−92)→(−16,−76) 往左平移 3.8 m 的线（羽化 1.2 后离中线仍 2.6 m）；
    // 北缘 z −105.5（+羽化 1.2）不压后沿横沟（沟南沿约 z −107.3）。
    Object.freeze({ id: "CollectionEastRise", kind: "polygon", op: "raise", dy: 1.2, feather: 1.2,
      points: Object.freeze([Pt(-25.8, -105.5), Pt(-16.8, -105.5), Pt(-16.8, -85.5),
        Pt(-17.46, -85.5), Pt(-22.78, -94.01), Pt(-25.8, -96.5)]),
      note: "06 东侧高地：洼地东壁 3 m、出坡与南行路起点左手的土壁（06B 左侧挡土墙）" }),

    // ── 07 南行交通沟 ─────────────────────────────────────────────────────────
    // 沟：底宽 3.4（halfW 1.7，≥ SquadMarchAi 的 3.24），cut 2.05 − 抛土 0.35 = 沟底比地面低 1.7 m。
    Object.freeze({ id: "SouthWalkCut", kind: "line", op: "cut", halfW: 1.7, feather: 1.0, dy: 2.05,
      points: Object.freeze([Pt(-16, -76, 0), Pt(-16, -69.5, 2.05), Pt(-15.8, -52.5, 2.05),
        Pt(-10.05, -41.2, 2.05), Pt(-7.2, -34.2, 0)]),
      note: "07 交通沟：沟底 −1.7、底宽 3.4；北口 6.5 m、南口 7.7 m 的进出坡；z −34.2 回到地面" }),
    // 抛土：沟两侧 0.35 m 的土埂（halfW 3.2 盖住沟心，由 cut 多挖的 0.35 抵掉）。
    // 南端提前在 (−8.4,−37.8) 收到 0：连羽化要留在 South07 框里（z ≤ −30）。
    Object.freeze({ id: "SouthWalkSpoil", kind: "line", op: "raise", halfW: 3.2, feather: 1.5, dy: 0.35,
      points: Object.freeze([Pt(-16, -76, 0), Pt(-16, -69.5, 0.35), Pt(-15.8, -52.5, 0.35),
        Pt(-10.05, -41.2, 0.35), Pt(-8.4, -37.8, 0)]),
      note: "07 沟沿抛土 0.35 m：沟壁连抛土 2.05 m，站在沟底看不到沟外地面" }),
  ]),
});
