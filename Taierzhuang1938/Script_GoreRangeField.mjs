// 断肢测试场实景院落（?gore=1）：1938 滕县城郊军事练兵靶场。
//
// 2026-11-25 迭代：
//   · 地表使用正式 PBR 夯土贴图（library.Get("Ground")），四周砖石院墙与靶壕防弹土堤；
//   · 撤除旧版塑料彩色体块与绊脚的 0.30 m 刀台，改为沙袋射击掩体（两侧留通行缺口）、
//     防爆沙袋弹坑、平地白灰墙白刃反差区与低矮木栈观察坪；
//   · 路牌改深色军用漆模板字风格（炭橄榄底 + 象牙字 + 黄铜边），与统一测试面板风格呼应。
// 约束：零 Math.random、静态几何全部 BuildSink 合批、玩家可见文案一律走 T("range.gore.*")。

import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, MakePlane, PlaceGeometry } from "./Script_Geo.mjs";
import { T } from "./Script_Text.mjs";
import {
  GORE_RANGE_ID, GORE_RANGE_WORLD, GORE_RANGE_CAMERA_FAR, GORE_RANGE_STATIONS,
  GORE_RANGE_POSTS, GORE_FIRING_LINE, GORE_LINE_RANGES, GORE_CRATER,
  GORE_BLADE_WALL, GORE_OBSERVATION,
} from "./Data_GoreRange.mjs";

const RING_SEGMENTS = 32;

const LOCAL_PALETTE = {
  Plaster: { color: 0xc9c2b2, roughness: 0.92, metalness: 0.0 },
  Chalk: { color: 0xd9d2be, roughness: 0.96, metalness: 0.0 },
  Scorch: { color: 0x3b342b, roughness: 0.98, metalness: 0.0 },
  Brass: { color: 0xb89c5a, roughness: 0.55, metalness: 0.35 },
  Rust: { color: 0x8d4c37, roughness: 0.78, metalness: 0.15 },
  Crimson: { color: 0x7b322b, roughness: 0.72, metalness: 0.05 },
  TimberDark: { color: 0x46382b, roughness: 0.88, metalness: 0.02 },
  EarthTrim: { color: 0x756854, roughness: 0.95, metalness: 0.0 },
};

/** 路牌清单（军用漆板：一次 draw call 画完全场文字）。 */
export function GoreRangeSigns() {
  return [
    { id: "Welcome", text: T("range.gore.signWelcome"), sub: T("range.gore.signWelcomeSub") },
    ...GORE_RANGE_STATIONS.map((station) => ({
      id: station.id, text: station.name,
      sub: station.id === "GoreLine" ? T("range.gore.signLineSub")
        : station.id === "GoreCrater" ? T("range.gore.signCraterSub")
          : station.id === "GoreBlade" ? T("range.gore.signBladeSub")
            : T("range.gore.signDeckSub"),
    })),
    ...GORE_RANGE_POSTS.map((post) => ({
      id: post.id, text: post.id,
      sub: post.rangeM ? T("range.gore.signDistance", { value: post.rangeM })
        : post.ringM ? T("range.gore.signRing", { value: post.ringM })
          : T("range.gore.signBladePost"),
    })),
    ...GORE_CRATER.rings.map((ring) => ({
      id: `Ring${ring}`, text: T("range.gore.signRing", { value: ring }), sub: "",
    })),
    ...GORE_LINE_RANGES.map((range) => ({
      id: `Dist${range}`, text: T("range.gore.signDistance", { value: range }), sub: "",
    })),
    { id: "Centre", text: T("range.gore.signCentre"), sub: "" },
  ];
}

function MakeMilitarySignAtlas(signs) {
  const cols = 4, tileW = 768, tileH = 160, rows = Math.ceil(signs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW; canvas.height = rows * tileH;
  const ctx = canvas.getContext("2d"), rects = new Map();
  ctx.fillStyle = "#1b1f1c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  signs.forEach((sign, i) => {
    const x = (i % cols) * tileW, y = Math.floor(i / cols) * tileH;
    // 炭绿底 + 橄榄边框 + 左侧黄铜强调条（与 .shellImpactLab 面板视觉统一）
    ctx.fillStyle = "#1b1f1c";
    ctx.fillRect(x + 4, y + 4, tileW - 8, tileH - 8);
    ctx.strokeStyle = "rgba(193,189,171,0.38)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 6, y + 6, tileW - 12, tileH - 12);
    ctx.fillStyle = "#d9bb7b";
    ctx.fillRect(x + 6, y + 6, 12, tileH - 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ece9dc";
    ctx.font = "bold 46px serif";
    ctx.fillText(sign.text, x + tileW / 2 + 4, sign.sub ? y + 58 : y + 82, tileW - 56);
    if (sign.sub) {
      ctx.fillStyle = "#b8b49f";
      ctx.font = "25px sans-serif";
      ctx.fillText(sign.sub, x + tileW / 2 + 4, y + 118, tileW - 56);
    }
    rects.set(sign.id, {
      u0: (x + 4) / canvas.width, u1: (x + tileW - 4) / canvas.width,
      v0: 1 - (y + tileH - 4) / canvas.height, v1: 1 - (y + 4) / canvas.height,
    });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, rects };
}

export class GoreRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: GORE_RANGE_WORLD, zones: GORE_RANGE_STATIONS, levelId: GORE_RANGE_ID, ...options,
    });
    this.worldLimits = GORE_RANGE_WORLD;
    this.cameraFar = GORE_RANGE_CAMERA_FAR;
    this.generatedExternalProps = [];
    this.localMaterials = new Map(Object.entries(LOCAL_PALETTE).map(([name, spec]) => [
      name,
      new THREE.MeshStandardMaterial({ name: "GoreCourtyard" + name, ...spec }),
    ]));
    this.signManifest = GoreRangeSigns();
  }

  /** 优先取正式 PBR 材质（Ground / BrickWall / Stone / Sandbag / WoodBeam / WoodCrate），否则取本地暖色调材质。 */
  ResolveMaterial(name) {
    if (this.localMaterials.has(name)) return this.localMaterials.get(name);
    return this.library?.Get?.(name) || this.localMaterials.get("EarthTrim");
  }

  Block(sink, matName, id, x, y, z, w, h, d, solid = false, tag = "goreFixture", uvScale = 1.0, ry = 0) {
    sink.Add(matName, PlaceGeometry(MakeBox(w, h, d, uvScale, id), { x, y, z, ry }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, tag);
    this.stats.structures += 1;
  }

  Sign(sink, id, x, y, z, w = 3.4, h = 0.72, ground = false, ry = 0) {
    const rect = this.atlas.rects.get(id);
    if (!rect) return;
    const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    }
    sink.Add("Signs", PlaceGeometry(g, { x, y, z, rx: ground ? -Math.PI / 2 : 0, ry }));
  }

  /** 贴地石灰画圈（非实体，不遮挡爆炸波与视线）。 */
  ChalkRing(sink, matName, id, cx, cz, radius, width = 0.055) {
    const step = (Math.PI * 2) / RING_SEGMENTS;
    const chord = radius * step * 1.04;
    for (let i = 0; i < RING_SEGMENTS; i += 1) {
      const angle = i * step;
      const g = MakeBox(width, 0.012, chord, 1, `${id}_${i}`);
      sink.Add(matName, PlaceGeometry(g, {
        x: cx + Math.cos(angle) * radius, y: 0.008, z: cz + Math.sin(angle) * radius, ry: -angle,
      }));
    }
    this.stats.structures += 1;
  }

  /** 建一组带立柱与压顶的院落砖墙段（带门垛节奏，告别空旷黑板墙）。 */
  AddCourtyardWall(sink, id, x0, z0, x1, z1, height = 3.2, thickness = 0.42) {
    const dx = x1 - x0, dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w = alongX ? length : thickness;
    const d = alongX ? thickness : length;
    // 石砌墙基 + 灰砖墙身 + 青石压顶
    this.Block(sink, "Stone", id + "_Base", cx, 0.25, cz, w + (alongX ? 0 : 0.08), 0.50, d + (alongX ? 0.08 : 0), false, "wall", 1.2);
    this.Block(sink, "BrickWall", id + "_Body", cx, height / 2, cz, w, height, d, true, "wall", 1.15);
    this.Block(sink, "Stone", id + "_Cap", cx, height + 0.08, cz, w + (alongX ? 0 : 0.16), 0.16, d + (alongX ? 0.16 : 0), false, "wall", 1.2);
    // 每隔 8 m 立一道砖垛柱，增加院落层次和日照阴影
    const bays = Math.max(2, Math.round(length / 8));
    for (let i = 0; i <= bays; i += 1) {
      const t = i / bays;
      const px = x0 + dx * t, pz = z0 + dz * t;
      this.Block(sink, "Stone", `${id}_Pilaster_${i}`, px, height / 2 + 0.08, pz, 0.62, height + 0.16, 0.62, false, "wall", 1.2);
    }
  }

  *BuildSteps() {
    yield { label: T("range.build.goreStations"), progress: 0.3 };
    const sink = new BuildSink(), b = this.bounds;
    this.atlas = MakeMilitarySignAtlas(this.signManifest);
    this.localMaterials.set("Signs", new THREE.MeshStandardMaterial({
      name: "GoreRangeSigns", map: this.atlas.texture, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));

    // --- 1. 夯土院落地表（正式 PBR 土地，与周围地形无塑料感割裂）----------
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const groundW = b.maxX - b.minX + 24, groundD = b.maxZ - b.minZ + 24;
    const groundMesh = new THREE.Mesh(MakePlane(groundW, groundD), this.ResolveMaterial("Ground"));
    groundMesh.position.set(cx, 0, cz);
    groundMesh.receiveShadow = true;
    groundMesh.name = "GoreCourtyardGround";
    this.scene.add(groundMesh);
    this.meshes.push(groundMesh);
    this.stats.groundChunks = 1;
    this.stats.groundTris = 2;

    // 院落青石主步道（连接观察坪、枪线、白刃区与弹坑，明确动线）
    sink.SetSector("GorePaths");
    this.Block(sink, "Stone", "PathCenter", 3340, 0.008, 3360.5, 3.2, 0.016, 8.0, false, "path", 1.0);
    this.Block(sink, "Stone", "PathCross", 3340, 0.007, 3344.2, 54.0, 0.014, 2.2, false, "path", 1.0);
    this.Block(sink, "Stone", "PathToBlade", 3316, 0.008, 3340.5, 2.6, 0.016, 6.2, false, "path", 1.0);
    this.Block(sink, "Stone", "PathToCrater", 3364, 0.008, 3342.2, 2.6, 0.016, 4.4, false, "path", 1.0);

    // 四周砖石院墙（封闭军事院落轮廓，消除漂浮在虚空中的白盒感）
    sink.SetSector("GoreWalls");
    this.AddCourtyardWall(sink, "WallNorth", b.minX, b.minZ, b.maxX, b.minZ, 3.6);
    this.AddCourtyardWall(sink, "WallSouth", b.minX, b.maxZ, b.maxX, b.maxZ, 3.0);
    this.AddCourtyardWall(sink, "WallWest", b.minX, b.minZ, b.minX, b.maxZ, 3.2);
    this.AddCourtyardWall(sink, "WallEast", b.maxX, b.minZ, b.maxX, b.maxZ, 3.2);

    // --- 2. 01 枪械射界（沙袋胸墙 + 木楞靶道 + 砖石防弹背墙 + 弹药箱）-------
    sink.SetSector("GoreLine");
    const line = GORE_FIRING_LINE;
    const lineW = line.x1 - line.x0, lineX = (line.x0 + line.x1) / 2;
    // 中央三段沙袋胸墙（左右两侧留宽畅通道，随时步行检视断口）
    this.Block(sink, "Sandbag", "FiringLineMain", lineX, line.h / 2, line.z, lineW, line.h, line.d, true, "sandbag", 0.72);
    this.Block(sink, "WoodBeam", "FiringLineRail", lineX, line.h + 0.04, line.z, lineW + 0.1, 0.08, 0.24, false, "wood", 1.0);
    // 两侧木质弹药箱点缀射击阵地
    this.Block(sink, "WoodCrate", "AmmoCrateL", line.x0 - 1.1, 0.28, line.z + 0.4, 0.92, 0.56, 0.52, true, "crate", 1.0);
    this.Block(sink, "WoodCrate", "AmmoCrateR", line.x1 + 1.1, 0.28, line.z + 0.4, 0.92, 0.56, 0.52, true, "crate", 1.0);
    // 25 米后方专设加厚砖石防弹背墙（高 3.8 m，接住步枪与机枪弹着扬尘）
    this.Block(sink, "BrickWall", "LineBackstop", lineX, 1.9, 3320.5, 24.0, 3.8, 0.65, true, "wall", 1.1);
    this.Block(sink, "WoodBeam", "LineBackstopBeam", lineX, 3.88, 3320.5, 24.4, 0.18, 0.76, false, "wood", 1.0);
    this.Block(sink, "EarthTrim", "LineBackstopBerm", lineX, 0.42, 3321.3, 23.0, 0.84, 1.1, false, "dirt", 1.0);
    // 10m 与 25m 柔和石灰标线与木桩里程牌
    for (const range of GORE_LINE_RANGES) {
      const z = line.z - range;
      this.Block(sink, "Chalk", "LineChalk" + range, lineX, 0.008, z + 0.95, lineW + 4.5, 0.014, 0.075);
      this.Block(sink, "WoodBeam", "DistPost" + range, line.x1 + 3.4, 0.85, z, 0.12, 1.7, 0.12, false, "wood");
      this.Sign(sink, "Dist" + range, line.x1 + 3.4, 1.48, z + 0.08, 2.2, 0.50);
    }

    // --- 3. 02 爆破弹坑区（爆心标桩 + 三环石灰线 + 外侧沙袋防爆土堤）--------
    sink.SetSector("GoreCrater");
    const crater = GORE_CRATER;
    // 爆心仅放一枚低调标记块，焦土弹坑由真实爆炸形变与贴花生成（不垫黑片以免穿模）
    this.Block(sink, "Rust", "CraterCentreMark", crater.x, 0.010, crater.z, 0.34, 0.020, 0.34, false, "marker", 1.0, Math.PI / 4);
    for (const ring of crater.rings) {
      this.ChalkRing(sink, "Chalk", "CraterRing" + ring, crater.x, crater.z, ring);
      this.Sign(sink, "Ring" + ring, crater.x - ring * 0.72, 0.016, crater.z + ring * 0.72 + 0.42, 0.82, 0.22, true);
    }
    // 弹坑北侧与东侧修沙袋防爆护堤（围合出专业爆破试场，同时南/西两侧完全敞开供射击与相机观察）
    this.Block(sink, "Sandbag", "CraterBaffleN", crater.x, 0.65, crater.z - 5.6, 10.6, 1.3, 0.85, true, "sandbag", 0.75);
    this.Block(sink, "Sandbag", "CraterBaffleE", crater.x + 5.6, 0.65, crater.z, 0.85, 1.3, 10.4, true, "sandbag", 0.75);
    this.Block(sink, "WoodBeam", "CraterSignPostL", crater.x - 1.8, 1.35, crater.z - 5.2, 0.14, 2.7, 0.14, false, "wood");
    this.Block(sink, "WoodBeam", "CraterSignPostR", crater.x + 1.8, 1.35, crater.z - 5.2, 0.14, 2.7, 0.14, false, "wood");

    // --- 4. 03 白刃劈砍区（零高台平地练兵坪 + 浅灰白灰反差背墙）-------------
    sink.SetSector("GoreBlade");
    const wall = GORE_BLADE_WALL;
    // 石砌地圈界定劈砍范围（纯视觉贴地边界，不绊脚）
    this.ChalkRing(sink, "Chalk", "BladeDuelRing", 3316, 3335.7, 4.2, 0.06);
    // 背后白灰粉刷砖墙：承接大刀横斩血弧喷溅，高对比度衬托日军军服与断口解剖细节！
    this.Block(sink, "Stone", "BladeWallPlinth", wall.x, 0.22, wall.z, wall.w + 0.16, 0.44, wall.d + 0.10, false, "wall", 1.0);
    this.Block(sink, "Plaster", "BladeWallBody", wall.x, wall.h / 2, wall.z, wall.w, wall.h, wall.d, true, "wall", 1.0);
    this.Block(sink, "TimberDark", "BladeWallHeader", wall.x, wall.h + 0.09, wall.z, wall.w + 0.3, 0.18, wall.d + 0.18, false, "wood", 1.0);
    // 两侧立木框架与武器架
    for (const sx of [wall.x - wall.w / 2, wall.x + wall.w / 2]) {
      this.Block(sink, "TimberDark", "BladePost_" + sx, sx, wall.h / 2, wall.z + 0.08, 0.22, wall.h + 0.18, 0.36, false, "wood");
    }
    this.Block(sink, "WoodCrate", "BladeCrateL", 3310.6, 0.32, 3334.4, 1.1, 0.64, 0.65, true, "crate", 1.0);
    this.Block(sink, "WoodCrate", "BladeCrateR", 3321.4, 0.32, 3334.4, 1.1, 0.64, 0.65, true, "crate", 1.0);

    // --- 5. 04 指挥观察坪（低木栈台 + 军械桌 + 院落检视背板）---------------
    sink.SetSector("GoreDeck");
    const deck = GORE_OBSERVATION.deck, board = GORE_OBSERVATION.board;
    this.Block(sink, "WoodBeam", "DeckPlanks", deck.x, deck.h / 2, deck.z, deck.w, deck.h, deck.d, true, "goreStand", 1.1);
    this.Block(sink, "Stone", "DeckCurb", deck.x, 0.07, deck.z - deck.d / 2 - 0.12, deck.w + 0.2, 0.14, 0.24, false, "stone");
    // 背后木框青砖展示墙（不挡第一眼视线）
    this.Block(sink, "BrickWall", "BoardWall", board.x, board.h / 2, board.z, board.w, board.h, 0.28, true, "wall", 1.1);
    this.Block(sink, "TimberDark", "BoardFrameTop", board.x, board.h + 0.08, board.z, board.w + 0.2, 0.16, 0.38, false, "wood");
    this.Sign(sink, "Welcome", board.x, board.h - 1.05, board.z - 0.16, 6.8, 1.38);

    // --- 6. 工位军用漆牌与木桩脚标 ------------------------------------------
    for (const station of GORE_RANGE_STATIONS) {
      sink.SetSector("Gore" + station.id);
      this.Sign(sink, station.id, station.signX, station.signY, station.signZ, 4.2, 0.88);
    }
    for (const post of GORE_RANGE_POSTS) {
      sink.SetSector("Gore" + post.station);
      const y = post.standY || 0;
      // 紧凑脚标贴地放置，爆坑区放至 3 m 环外缘避免与弹坑隆起相穿
      const zOff = post.station === "GoreCrater" ? 1.15 : 0.88;
      this.Sign(sink, post.id, post.x, y + 0.016, post.z + zOff, 0.82, 0.22, true);
    }

    for (const mesh of sink.Flush(this.scene, { Get: (name) => this.ResolveMaterial(name) })) {
      if (mesh.material === this.localMaterials.get("Signs")) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = sink.covers.slice();
    this.BuildCollisionGrid();
    yield { label: T("range.build.goreReady"), progress: 1 };
  }

  Dispose() {
    super.Dispose();
    for (const material of this.localMaterials.values()) material.dispose();
    this.localMaterials.clear();
    this.atlas?.texture.dispose();
    this.atlas = null;
  }
}

export default GoreRangeField;
