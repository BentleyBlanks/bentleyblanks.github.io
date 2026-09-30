// 第一关 11–14 局部地形修饰（桥头接运场、侧巷、车路路肩、西沟北段）。
// 形状格式、叠加顺序与校验见 Data_FirstLevelWhiteboxTerrain.mjs 文件头与
// docs/Data_FirstLevelWhitebox0518Gap.md §地形接口。只许往本区 boxes 里写。
// 北沙河河槽（z 138.8–167.2）由 Topology 的 RiverCutAt 最后取 min，这里改不动也不该改。纯数据，无 import。
//
// 2026-09-27 按概念图 11–14 重做（区 C）：
//   · 车路两侧场地下沉 1.0–1.1 m 的浅洼：车路本身不动 —— 路桥甲板钉在 y 0.13
//     （MISSION_SOUTH_BRIDGE.deckY），路一降牛车就顶着桥头墙；于是桥头路成了两侧跌落的
//     路堤（13_1/13_2「路在坎上」）。概念图的「整场向河缓降」做不到：河口 z 138.8 以南
//     任何修饰都被 TerrainTest 的河槽逐位断言拦下，洼地南缘只能在河口前回到原地面。
//   · 西侧土台：x 29–42.5、z 85–103 抬 2.2 m，东面陡（仓房背墙贴着坎脚），西/北/南缓坡。
//   · 西沟口两侧与北段东沿抛土 0.45 m（离沟沿 ≥ 0.6 m 起，(54,114) 9 m 回归坡之外）。
export const WHITEBOX_TERRAIN_TRANSFER = Object.freeze({
  id: "Transfer1114",
  stages: Object.freeze([11, 12, 13, 14]),
  // 踩出来的小路（只染色不改高度）：{ id, points, width, wear?, note }，口径见 Data_FirstLevelWhiteboxTerrain 文件头。
  paths: Object.freeze([
    // 2026-09-30（12 一夫当关）：村路（夹道）的泥路一直压到村口低墙的路口，再接进场院（车路本身在 MISSION_TERRAIN.roads 里）。
    Object.freeze({ id: "TransferLaneMud", width: 4.0, wear: .8,
      points: Object.freeze([
        Object.freeze({ x: 76.6, z: 79.0 }), Object.freeze({ x: 76.3, z: 83 }), Object.freeze({ x: 76.2, z: 88 }),
      ]),
      note: "12 村路南段：泥路压到低墙路口（接 Village 区 VillageLaneMud）" }),
  ]),
  boxes: Object.freeze([
    Object.freeze({ id: "Transfer", minX: 25, maxX: 125, minZ: 75, maxZ: 150 }),
  ]),
  shapes: Object.freeze([
    // 12（2026-09-30 一夫当关）：守线后面这块（x 58.8–77.9、z 83.6–92.2，胸墙整条坐在上面）比村路高 0.4 m，
    // 顺子的射口俯控来路；feather 2.5 = 坡 0.24，担架与班里人走得过。墙外（北）2.5 m 内落回路面，
    // 从村路看胸墙比从射口看高出一截。通行口（x 77.9–81.0，village 路线与过路车 x 79.3）在台的东缘坡上，坡 ≤ 0.2。
    Object.freeze({ id: "GuardPad", kind: "box", op: "raise", dy: 0.4, feather: 2.5,
      x: 68.35, z: 87.9, w: 19.1, d: 8.6,
      note: "12 守线台：x 58.8–77.9、z 83.6–92.2 抬 0.4，胸墙坐在台上" }),
    // 11：西侧土坎 + 坎顶平台（背景纵队）。两块 raise 取 max：Back 管平台与三面缓坡，
    // Scarp 只把东面做陡（feather 1.0 ≈ 一格），东坎脚落在 x 42.5，仓房西墙 x 43 贴坎。
    Object.freeze({ id: "WestTerraceBack", kind: "box", op: "raise", dy: 2.2, feather: 4.5,
      x: 34.25, z: 94, w: 9.5, d: 18,
      note: "11 西侧 2.2 m 土台，平台 x 29.5–39，西/北/南 feather 4.5（坡 0.73，可走）" }),
    Object.freeze({ id: "WestTerraceScarp", kind: "box", op: "raise", dy: 2.2, feather: 1.0,
      x: 39.25, z: 94, w: 4.5, d: 16,
      note: "11 土台东面陡坎（x 41.5→42.5 落差 2.2），接运场这一侧读成一道坎" }),
    // 11/13：车路两侧的场地下沉成浅洼（路堤两侧跌落）。两块 cut 取 max 叠出台阶状缓坡。
    // 南缘必须在河口 z 138.8 回到原地面：TerrainTest 断言 RiverCutAt>0 的地方逐位不变，
    // 所以「一路降到河边」做不到，只能是洼地 + 河口土沿；河谷感由河槽本身（4.2 m）给。
    Object.freeze({ id: "YardDipWestOuter", kind: "box", op: "cut", dy: 0.5, feather: 4.5,
      x: 63.5, z: 125.65, w: 11, d: 17.3,
      note: "11/13 路西洼地外圈：x 58–69、z 117–134.3 降 0.5（坡 ≤0.17），南缘 z 138.8 归零" }),
    Object.freeze({ id: "YardDipWestInner", kind: "box", op: "cut", dy: 1.1, feather: 5.5,
      x: 63.75, z: 128.15, w: 9.5, d: 10.3,
      note: "11/13 路西洼地内圈：x 59–68.5、z 123–133.3 降 1.1；x 68.5→74 是路堤西坡" }),
    Object.freeze({ id: "YardDipEastOuter", kind: "box", op: "cut", dy: 0.5, feather: 4.5,
      x: 90.75, z: 131.65, w: 10.5, d: 5.3,
      note: "13 路东洼地外圈（13_1 路左缓坡）：x 85.5–100、z 129–134.3；北缘让开车位 (94,126)" }),
    Object.freeze({ id: "YardDipEastInner", kind: "box", op: "cut", dy: 1.0, feather: 5.5,
      x: 90.75, z: 131.9, w: 8.5, d: 2.8,
      note: "13 路东洼地内圈：x 86.5–99、z 130.5–133.3 降 1.0；x 81→86.5 是路堤东坡" }),
    // 13_3 / 13_4（2026-09-30 C2 包）：西高墙（x 71，z 118.5–130）的墙脚一条路沟，底宽 1.6 m、深 0.75，
    // 沟底约 −1.1…−1.4；人贴墙蹲在里头（WestFoot* 遮挡点在 x 72.6），13_4 的低位机位也在里头。
    // 两端各 1.6 m 逐点 dy 0 收进路面；z 130.8 以南是卸车点 (72.6,135) 到沟口的斜向担架走廊，沟不进去。
    Object.freeze({ id: "RoadSideDitchWest", kind: "line", op: "cut", dy: 0.75, feather: 1.2, halfW: 0.8,
      points: Object.freeze([
        Object.freeze({ x: 72.6, z: 118.4, dy: 0 }), Object.freeze({ x: 72.6, z: 120.2 }),
        Object.freeze({ x: 72.6, z: 129.2 }), Object.freeze({ x: 72.6, z: 130.8, dy: 0 }),
      ]),
      note: "13 路右侧高墙墙脚的路沟：底宽 1.6、深 0.75，两端进出坡各 1.6 m" }),
    // 11_1 左手的高坎（概念图坎顶有行军纵队）：河口北侧、侧巷以南的一道堤，顶宽 ~9×4 m。
    // 从 11_1 北口隔着东墙缺口 z 95.6–99.6 看，坎顶要高过侧巷南墙（2.6 m）才入画，所以 3.6 m；坡面 feather 2 是陡的背景坎，
    // 不走人。南缘羽化正好止于河口 z 138.8；西缘 x 100 让开草房与牲口挣脱线 (94,134)→(119,169)。
    Object.freeze({ id: "EastLeveeRidge", kind: "box", op: "raise", dy: 3.6, feather: 2,
      x: 106.5, z: 134.65, w: 9, d: 4.3,
      note: "11 东侧河堤高坎：x 102–111、z 132.5–136.8 抬 3.6，羽化到 x 100–113 / z 130.5–138.8" }),
    // 14：西沟口两侧抛土（沟口 (54,114) 9 m 回归缓坡之外），北段东沿接着抛到河口。
    Object.freeze({ id: "DitchMouthBermNorth", kind: "line", op: "raise", dy: 0.45, feather: 1.2, halfW: 0.7,
      points: Object.freeze([Object.freeze({ x: 35, z: 110.6 }), Object.freeze({ x: 44.5, z: 110.4 })]),
      note: "14 沟口北沿抛土：北沿 z≈112，核心离沟沿 ≥ 0.7 m" }),
    Object.freeze({ id: "DitchEastLipBerm", kind: "line", op: "raise", dy: 0.45, feather: 1.2, halfW: 0.7,
      points: Object.freeze([
        Object.freeze({ x: 46.5, z: 119.5 }), Object.freeze({ x: 42.5, z: 119.7 }),
        Object.freeze({ x: 41.6, z: 121.2 }), Object.freeze({ x: 40.6, z: 124 }),
        Object.freeze({ x: 39.4, z: 128 }), Object.freeze({ x: 37.6, z: 131.6 }),
        Object.freeze({ x: 37.9, z: 134 }), Object.freeze({ x: 40.1, z: 136.3 }),
        Object.freeze({ x: 42.2, z: 138.2 }),
      ]),
      note: "14 沟口南沿 + 北段东沿抛土 0.45（叠在 PCG 抛土上约 0.6–0.7），沟沿外 0.6 m 起" }),
  ]),
});
