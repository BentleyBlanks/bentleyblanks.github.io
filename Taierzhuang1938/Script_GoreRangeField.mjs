// 断肢测试场的地皮（?gore=1）。与 RangeField / MovementRangeField 同一套战场接口：
// GroundHeight / StandHeight / NearbyColliders / Raycast / WaterDepth / bounds /
// colliders / covers / objectives / BuildSteps / Dispose —— 规则层四个模块
// （Ai / Player / Navigation / Combat）谁都不知道底下是这片白盒。
//
// 工程约束同前辈：不许 Math.random、静态几何一律走 BuildSink 合批、碰撞盒 tag 有意义、
// 路牌走一张 Canvas atlas（一次 draw call 画完全场的字）。坐标全在 Data_GoreRange。
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { T } from "./Script_Text.mjs";
import {
  GORE_RANGE_ID, GORE_RANGE_WORLD, GORE_RANGE_CAMERA_FAR, GORE_RANGE_STATIONS,
  GORE_RANGE_POSTS, GORE_FIRING_LINE, GORE_LINE_RANGES, GORE_CRATER,
  GORE_BLADE_STAND, GORE_OBSERVATION,
} from "./Data_GoreRange.mjs";

const PALETTE = {
  Floor: 0xa9b0b4, White: 0xe4e7e6, Ink: 0x2d3841, Grid: 0x8f9aa1,
  Blue: 0x2b78b6, Orange: 0xc9803a, Red: 0xb04a48, Cyan: 0x3a8b95, Sand: 0x9c9270,
};
/** 环线一圈切多少段。24 段的圆在 3 m 半径上看不出是多边形，几何又便宜。 */
const RING_SEGMENTS = 24;

/** 路牌清单。id 是 atlas 的格子键，text/sub 是画上去的两行。 */
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
    // 每个木桩脚下一块编号牌：id 是 ASCII 代号（数据里的），副标题写它属于哪一档。
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

function MakeAtlas(signs) {
  const cols = 4, tileW = 768, tileH = 160, rows = Math.ceil(signs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW; canvas.height = rows * tileH;
  const ctx = canvas.getContext("2d"), rects = new Map();
  ctx.fillStyle = "#eef1f1"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  signs.forEach((sign, i) => {
    const x = i % cols * tileW, y = Math.floor(i / cols) * tileH;
    ctx.fillStyle = "#26323d"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 49px sans-serif"; ctx.fillText(sign.text, x + tileW / 2, y + 57, tileW - 30);
    ctx.font = "27px sans-serif"; ctx.fillText(sign.sub, x + tileW / 2, y + 121, tileW - 30);
    rects.set(sign.id, {
      u0: (x + 2) / canvas.width, u1: (x + tileW - 2) / canvas.width,
      v0: 1 - (y + tileH - 2) / canvas.height, v1: 1 - (y + 2) / canvas.height,
    });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return { texture, rects };
}

export class GoreRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: GORE_RANGE_WORLD, zones: GORE_RANGE_STATIONS, levelId: GORE_RANGE_ID, ...options,
    });
    this.worldLimits = GORE_RANGE_WORLD;
    this.cameraFar = GORE_RANGE_CAMERA_FAR;
    // 这片白盒不接外部 GLB 布景与 tzm 饰件（装配层按 phase.id 跳过），留一张空表给它们的读取方。
    this.generatedExternalProps = [];
    this.materials = new Map(Object.entries(PALETTE).map(([name, color]) => [name,
      new THREE.MeshStandardMaterial({ name: "GoreRange" + name, color, roughness: 0.93 })]));
    this.signManifest = GoreRangeSigns();
  }

  Block(sink, name, id, x, y, z, w, h, d, solid = false, tag = "goreFixture") {
    sink.Add(name, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, tag);
    this.stats.structures += 1;
  }

  Sign(sink, id, x, y, z, w = 3.6, h = 0.75, ground = false) {
    const rect = this.atlas.rects.get(id);
    if (!rect) return;
    const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    }
    sink.Add("Signs", PlaceGeometry(g, { x, y, z, rx: ground ? -Math.PI / 2 : 0 }));
  }

  /** 一道环线：24 段小方块围成的圆，只画不挡（爆炸判定不许被它遮住）。 */
  Ring(sink, name, id, cx, cz, radius) {
    const step = Math.PI * 2 / RING_SEGMENTS;
    const chord = radius * step * 1.08;
    for (let i = 0; i < RING_SEGMENTS; i += 1) {
      const angle = i * step;
      const g = MakeBox(0.06, 0.02, chord, 1, `${id}_${i}`);
      sink.Add(name, PlaceGeometry(g, {
        x: cx + Math.cos(angle) * radius, y: 0.011, z: cz + Math.sin(angle) * radius, ry: -angle,
      }));
    }
    this.stats.structures += 1;
  }

  *BuildSteps() {
    yield { label: T("range.build.goreStations"), progress: 0.3 };
    const sink = new BuildSink(), b = this.bounds;
    this.atlas = MakeAtlas(this.signManifest);
    this.materials.set("Signs", new THREE.MeshBasicMaterial({
      name: "GoreRangeSigns", map: this.atlas.texture, side: THREE.DoubleSide, toneMapped: false,
    }));

    // --- 地皮与边界 -------------------------------------------------------
    sink.SetSector("GoreFloor");
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    this.Block(sink, "Floor", "Floor", cx, -0.1, cz, b.maxX - b.minX, 0.2, b.maxZ - b.minZ);
    this.stats.groundChunks = 1; this.stats.groundTris = 12;
    for (let x = b.minX + 5; x < b.maxX; x += 5) {
      this.Block(sink, "Grid", "GridX" + x, x, 0.003, cz, 0.015, 0.006, b.maxZ - b.minZ);
    }
    for (let z = b.minZ + 5; z < b.maxZ; z += 5) {
      this.Block(sink, "Grid", "GridZ" + z, cx, 0.003, z, b.maxX - b.minX, 0.006, 0.015);
    }
    for (const x of [b.minX, b.maxX]) {
      this.Block(sink, "Ink", "BoundaryX" + x, x, 1.6, cz, 0.3, 3.2, b.maxZ - b.minZ, true, "wall");
    }
    for (const z of [b.minZ, b.maxZ]) {
      this.Block(sink, "Ink", "BoundaryZ" + z, cx, 1.6, z, b.maxX - b.minX, 3.2, 0.3, true, "wall");
    }

    // --- 01 枪线 ----------------------------------------------------------
    sink.SetSector("GoreLine");
    const line = GORE_FIRING_LINE, lineW = line.x1 - line.x0, lineX = (line.x0 + line.x1) / 2;
    this.Block(sink, "Sand", "FiringLine", lineX, line.h / 2, line.z, lineW, line.h, line.d, true, "sandbag");
    this.Block(sink, "White", "FiringLineTop", lineX, line.h - 0.012, line.z, lineW, 0.024, line.d);
    for (const range of GORE_LINE_RANGES) {
      const z = line.z - range;
      this.Block(sink, "Blue", "LineMark" + range, lineX, 0.014, z + 0.9, lineW + 4, 0.028, 0.09);
      this.Sign(sink, "Dist" + range, line.x1 + 3.2, 0.03, z + 0.9, 3.2, 0.72, true);
      this.Sign(sink, "Dist" + range, line.x1 + 3.2, 1.5, z, 3.2, 0.72);
    }

    // --- 02 炸坑 ----------------------------------------------------------
    sink.SetSector("GoreCrater");
    const crater = GORE_CRATER;
    this.Block(sink, "Orange", "CraterCentre", crater.x, 0.012, crater.z, 0.6, 0.024, 0.6);
    this.Sign(sink, "Centre", crater.x, 0.03, crater.z + 1.05, 2.4, 0.55, true);
    for (const ring of crater.rings) this.Ring(sink, "Orange", "CraterRing" + ring, crater.x, crater.z, ring);
    for (const ring of crater.rings) {
      this.Sign(sink, "Ring" + ring, crater.x - ring, 0.03, crater.z - ring - 0.55, 1.9, 0.45, true);
    }

    // --- 03 刀桩 ----------------------------------------------------------
    sink.SetSector("GoreBlade");
    const stand = GORE_BLADE_STAND;
    this.Block(sink, "Red", "BladeStand", stand.x, stand.h / 2, stand.z, stand.w, stand.h, stand.d, true, "goreStand");
    this.Block(sink, "White", "BladeStandTop", stand.x, stand.h - 0.012, stand.z, stand.w, 0.024, stand.d);

    // --- 04 观察台与白板 --------------------------------------------------
    sink.SetSector("GoreDeck");
    const deck = GORE_OBSERVATION.deck, board = GORE_OBSERVATION.board;
    this.Block(sink, "Cyan", "Deck", deck.x, deck.h / 2, deck.z, deck.w, deck.h, deck.d, true, "goreStand");
    this.Block(sink, "White", "DeckTop", deck.x, deck.h - 0.012, deck.z, deck.w, 0.024, deck.d);
    // 白板：截图背景。它同时当这一侧的挡墙，所以登记碰撞。
    this.Block(sink, "White", "Board", board.x, board.h / 2, board.z, board.w, board.h, 0.25, true, "wall");
    this.Sign(sink, "Welcome", board.x, board.h - 1.1, board.z - 0.14, 8, 1.65);

    // --- 工位牌与木桩编号牌 -----------------------------------------------
    for (const station of GORE_RANGE_STATIONS) {
      sink.SetSector("Gore" + station.id);
      this.Block(sink, station.color, station.id + "Pad", station.x, 0.012, station.z, 3, 0.024, 0.16);
      this.Sign(sink, station.id, station.x, station.signY, station.signZ, 5, 1.04);
      if (station.floorZ !== null) this.Sign(sink, station.id, station.x, 0.026, station.floorZ, 5, 1.04, true);
    }
    for (const post of GORE_RANGE_POSTS) {
      sink.SetSector("Gore" + post.station);
      const y = post.standY || 0;
      // 牌子贴在脚下（面朝天）—— 立牌会挡住木桩兵的腿，而腿正是这片场地要看的东西。
      this.Sign(sink, post.id, post.x, y + 0.028, post.z + 0.95, 1.5, 0.34, true);
    }

    for (const mesh of sink.Flush(this.scene, { Get: (name) => this.materials.get(name) })) {
      if (mesh.material === this.materials.get("Signs")) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = sink.covers.slice();
    this.BuildCollisionGrid();
    yield { label: T("range.build.goreReady"), progress: 1 };
  }

  Dispose() {
    super.Dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.atlas?.texture.dispose();
    this.atlas = null;
  }
}

export default GoreRangeField;
