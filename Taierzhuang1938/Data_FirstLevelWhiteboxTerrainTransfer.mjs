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
  boxes: Object.freeze([
    Object.freeze({ id: "Transfer", minX: 25, maxX: 125, minZ: 75, maxZ: 150 }),
  ]),
  shapes: Object.freeze([
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
      x: 92.75, z: 131.65, w: 14.5, d: 5.3,
      note: "13 路东洼地外圈（13_1 路左缓坡）：x 85.5–100、z 129–134.3；北缘让开车位 (94,126)" }),
    Object.freeze({ id: "YardDipEastInner", kind: "box", op: "cut", dy: 1.0, feather: 5.5,
      x: 92.75, z: 131.9, w: 12.5, d: 2.8,
      note: "13 路东洼地内圈：x 86.5–99、z 130.5–133.3 降 1.0；x 81→86.5 是路堤东坡" }),
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
