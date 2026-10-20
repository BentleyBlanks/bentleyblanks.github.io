// 白盒关卡编辑器的 3D 标记（docs/Data_EditorBlockout.md §5.5）。
//
// 全部画在 post.AddDebugOverlay(root) 里：默认白盒画质会把场景里的 Sprite / Points 藏掉、
// 把普通 Mesh 涂灰，调试叠加层不受影响。颜色按曝光预补（同 Script_EditorAi 的叠加层：
// 峰值压到 0.75，否则 ACES 会把阵营色冲成白）。
//
// 看得见 / 被挡住两种画法：同一份几何画两遍 —— 一遍做深度测试（亮），一遍穿墙（暗、半透明；深度钉在离眼 1.25 m，
// 只有第一人称的手 / 枪和贴脸 1.25 m 内的东西挡得住它，见 BehindForeground）。
// 被墙挡住的人也找得到，但一眼分得出现在看不看得见他。「穿墙显示」关掉第二遍。
// 射界扇例外（§5.5）：只画深度测试那一遍（不穿墙），填充很淡（约 0.1）、描边细；
// 扇子起点离相机 6 m 以内整片淡出 —— 第一人称低机位时，近处的扇子会像一大张半透明的布糊满屏幕；
// 起点在远处、扇面却铺到眼前的，离相机 3 m 内的那部分逐像素淡掉。
// 地环与朝向箭头压在脚下的高度附近（不顺着沟壁竖起来，低机位看不会是一大片斜色块）。
//
// 头顶标签是 DOM（挂在单位的世界位置上，不挂 actor 子节点）：有名字的「色点 + 名字」，
// 无名普通兵只有色点；120 m 外只留有名字的与机枪；近的先排、互相避让；
// 下一步目标在屏幕外时贴边显示箭头 + 「下一步 · 文字 · 距离」。
//
// 2026-10-20 三层新标记（§5.5，规则在 Script_EditorBlockoutMarkerRules）：
//   · 「标签」改三档：有名字的（原样）/ 全部（无名的人按身份兜底「国军 04」「日军」「担架」…；120 m 外照旧只留有名字的与机枪）/ 关；
//   · 地标（场景文件 landmarks，SetLandmarks）：按 kind 分色的亮线框（比实物略大、薄的也撑到 0.3 m）+ 淡填充 + 细光柱 + 顶上两片小旗 +
//     DOM 标签（名字 · 小字 note）；片区画虚线描边 / 虚线地环；被挡住的照「穿墙显示」画第二遍；开关「地标」；
//   · 站位（这一关所有关键帧的玩家站位，SetStations）：地上小三角朝着那一帧的朝向、当前帧亮且带地环、其余淡，按顺序连一条细虚线，
//     标签「拍号 + 名字」；站在它上面（2 m 内）时不挂标签；开关「站位」。

import * as THREE from "three";
import { BLOCKOUT_MG_WEAPONS } from "./Script_EditorBlockoutConfig.mjs";
import {
  BLOCKOUT_LAYER_DEFAULTS, BLOCKOUT_LANDMARK_DRAW, BLOCKOUT_STATION_DRAW, LandmarkGeometry, StationLabel, UnitLabelTexts, LabelMode,
} from "./Script_EditorBlockoutMarkerRules.mjs";

export const BLOCKOUT_MARKER_COLORS = Object.freeze({
  ija: "#d6604a", nra: "#9dc0e4", civ: "#9fc47f",
  next: "#dfbd68", objective: "#dfbd68", poi: "#e3cf93", landmark: "#d4d8cf", danger: "#e58a4a",
});
const OVERLAY_PEAK = 0.75;
const LABEL_FAR_M = 120;
const FLASH_S = 0.6;
const DEG = Math.PI / 180;

/** 射界扇（§5.5）：填充、描边的不透明度，与近处淡出的距离（扇子起点到相机，米）。 */
export const BLOCKOUT_FAN = Object.freeze({
  fillAlpha: 0.1,
  fillEdgeFalloff: 0.4,     // 射程边缘比起点再淡这么多
  edgeAlpha: 0.5,
  fadeNearM: 6,             // 这以内整片不画
  fadeFarM: 10,             // 这以外不淡
  fadeStep: 0.1,            // 淡出量化到这一档：相机走动时扇子只在跨档时重建
  // 起点在远处、扇面却铺到眼前（人站在机枪射界里、扇面贴着沟壁）：离相机这么近的那部分逐像素淡掉
  surfaceNearM: 3,
  surfaceFarM: 8,
});

/**
 * 脚下地环与朝向箭头贴地时最多往上爬多少 / 往下落多少（米，相对脚下）。人贴着沟壁站时，
 * 照地形逐点贴地的地环会顺着沟壁竖起来，低机位看就是一大片斜着的色块；压平在脚下就不会。
 */
const UNIT_GROUND_CLAMP = Object.freeze({ above: 0.2, below: 0.6 });
// 大地环（战车 / 担架 / 车）压得太死会整段埋进坡里：允许的起伏随半径放大。
function UnitClamp(radius) {
  return { above: Math.max(UNIT_GROUND_CLAMP.above, 0.3 * radius), below: Math.max(UNIT_GROUND_CLAMP.below, 0.5 * radius) };
}
// POI 与「下一步」的地环不压：它们半径大（2–6 m），压平后贴着坡的那半圈会埋进土里
// （14-1 的飞机转弯点、15-1 的下一步地环实测埋深 2 m 以上），顺地形贴就好。

/** 起点离相机 distanceM 时扇子的不透明度系数（0…1，按 fadeStep 量化）。 */
export function FanFade(distanceM) {
  const { fadeNearM, fadeFarM, fadeStep } = BLOCKOUT_FAN;
  if (!(distanceM > fadeNearM)) return 0;
  const t = Math.min(1, (distanceM - fadeNearM) / (fadeFarM - fadeNearM));
  return Math.round(Math.round(t / fadeStep) * fadeStep * 1000) / 1000;
}

const RING_RADIUS = { soldier: 0.55, officer: 0.6, civilian: 0.5, child: 0.4, tank: 3.4, litter: 1.9, cart: 2.4, animal: 1.2 };
const HEAD_Y = { soldier: 2.05, officer: 2.05, civilian: 2.0, child: 1.45, tank: 3.1, litter: 2.1, cart: 2.2, animal: 1.9 };

function Rgba(hex, alpha = 1) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, alpha];
}

/**
 * 一段几何（三角 + 线段），各自按顶点存 xyz + rgba。
 * tri / line 画两遍（看得见 + 穿墙）；fanTri / fanLine 是射界扇，只画深度测试那一遍。
 */
class Chunk {
  constructor(groundAt) { this.groundAt = groundAt; this.tri = []; this.line = []; this.fanTri = []; this.fanLine = []; this.clamp = null; }
  /** 贴地高度；clamp = {y, above, below} 时夹在 y 上下这个范围里（地环、箭头不顺着墙爬）。 */
  Y(x, z, lift) {
    let ground = this.groundAt(x, z);
    const c = this.clamp;
    if (c) ground = Math.min(c.y + c.above, Math.max(c.y - c.below, ground));
    return ground + lift;
  }
  /** 之后画的贴地几何以 (x, z) 处的地面为准夹住高度；limits 为 null 时取消。 */
  ClampAround(x, z, limits) { this.clamp = limits ? { y: this.groundAt(x, z), above: limits.above, below: limits.below } : null; }
  Tri(a, b, c, rgba, out = this.tri) { out.push(...a, ...rgba, ...b, ...rgba, ...c, ...rgba); }
  Seg(a, b, rgba, out = this.line) { out.push(...a, ...rgba, ...b, ...rgba); }
  /** 贴地的带子（每段一个四边形）。dash：[实长, 空长]。 */
  Ribbon(points, width, rgba, { lift = 0.08, dash = null } = {}) {
    if (points.length < 2) return;
    let along = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-4) continue;
      const nx = -(b.z - a.z) / len * width / 2, nz = (b.x - a.x) / len * width / 2;
      const pieces = dash ? [] : [[0, len]];
      if (dash) {
        // 每一步至少前进 1 mm：浮点取模卡在段界上时也不会原地打转
        const period = dash[0] + dash[1];
        let s = 0, phase = along % period;
        while (s < len - 1e-6) {
          const onDash = phase < dash[0];
          const step = Math.max(1e-3, Math.min(onDash ? dash[0] - phase : period - phase, len - s));
          if (onDash) pieces.push([s, Math.min(len, s + step)]);
          s += step;
          phase += step;
          if (phase >= period - 1e-9) phase -= period;
        }
      }
      for (const [s0, s1] of pieces) {
        // 长段按 2 m 切开贴地，别让带子在起伏处钻进土里
        const steps = Math.max(1, Math.ceil((s1 - s0) / 2));
        for (let k = 0; k < steps; k++) {
          const t0 = (s0 + (s1 - s0) * k / steps) / len, t1 = (s0 + (s1 - s0) * (k + 1) / steps) / len;
          const x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0;
          const x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1;
          const y0 = this.Y(x0, z0, lift), y1 = this.Y(x1, z1, lift);
          const p0 = [x0 - nx, y0, z0 - nz], p1 = [x0 + nx, y0, z0 + nz], p2 = [x1 + nx, y1, z1 + nz], p3 = [x1 - nx, y1, z1 - nz];
          this.Tri(p0, p1, p2, rgba); this.Tri(p0, p2, p3, rgba);
        }
      }
      along += len;
    }
  }
  Ring(cx, cz, radius, width, rgba, { dash = false, segments = 28, lift = 0.08 } = {}) {
    for (let i = 0; i < segments; i++) {
      if (dash && i % 2) continue;
      const a0 = i / segments * Math.PI * 2, a1 = (i + 1) / segments * Math.PI * 2;
      const ri = radius - width / 2, ro = radius + width / 2;
      const P = (a, r) => { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return [x, this.Y(x, z, lift), z]; };
      const p0 = P(a0, ri), p1 = P(a0, ro), p2 = P(a1, ro), p3 = P(a1, ri);
      this.Tri(p0, p1, p2, rgba); this.Tri(p0, p2, p3, rgba);
    }
  }
  /** 地上的箭头头部（实心三角）。dir 是单位向量 {x,z}。 */
  Head(tip, dir, size, rgba, lift = 0.1) {
    const bx = tip.x - dir.x * size, bz = tip.z - dir.z * size;
    const nx = -dir.z * size * 0.55, nz = dir.x * size * 0.55;
    this.Tri([tip.x, this.Y(tip.x, tip.z, lift), tip.z], [bx + nx, this.Y(bx + nx, bz + nz, lift), bz + nz],
      [bx - nx, this.Y(bx - nx, bz - nz, lift), bz - nz], rgba);
  }
  /** 射界扇：贴地的淡填充 + 两条边线与外弧（细线）。只进 fanTri / fanLine（不穿墙）。 */
  Fan(cx, cz, yawDeg, halfDeg, range, fill, edge) {
    const angSteps = Math.max(4, Math.ceil(halfDeg * 2 / 5));
    const radSteps = Math.max(2, Math.ceil(range / 3));
    const P = (k, j) => {
      const a = (yawDeg - halfDeg + 2 * halfDeg * k / angSteps) * DEG, r = range * j / radSteps;
      const x = cx - Math.sin(a) * r, z = cz - Math.cos(a) * r;
      return [x, this.Y(x, z, 0.14), z];
    };
    const grid = [];
    for (let j = 0; j <= radSteps; j++) { const row = []; for (let k = 0; k <= angSteps; k++) row.push(P(k, j)); grid.push(row); }
    for (let j = 0; j < radSteps; j++) for (let k = 0; k < angSteps; k++) {
      const a = grid[j][k], b = grid[j][k + 1], c = grid[j + 1][k + 1], d = grid[j + 1][k];
      // 填充向外渐淡：近处实一点，射程边缘轻一点
      const f = [fill[0], fill[1], fill[2], fill[3] * (1 - BLOCKOUT_FAN.fillEdgeFalloff * j / radSteps)];
      if (j === 0) this.Tri(a, c, d, f, this.fanTri);
      else { this.Tri(a, b, c, f, this.fanTri); this.Tri(a, c, d, f, this.fanTri); }
    }
    for (let j = 0; j < radSteps; j++) {
      this.Seg(grid[j][0], grid[j + 1][0], edge, this.fanLine);
      this.Seg(grid[j][angSteps], grid[j + 1][angSteps], edge, this.fanLine);
    }
    for (let k = 0; k < angSteps; k++) this.Seg(grid[radSteps][k], grid[radSteps][k + 1], edge, this.fanLine);
  }
  /** 竖光柱：围一圈的竖线。 */
  Pillar(x, z, height, radius, rgba, count = 4) {
    const y = this.groundAt(x, z);
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      this.Seg([px, y, pz], [px, y + height, pz], rgba);
    }
    if (count > 1) this.Seg([x, y, z], [x, y + height, z], rgba);
  }
}

/**
 * 一层可增长的动态缓冲（三角或线段），两遍画法共用同一份 geometry。
 * xray:false 只建深度测试那一遍（射界扇），occluded / occludedMaterial 为 null。
 */
class DynamicLayer {
  constructor(name, Ctor, makeMaterial, { xray = true, order = 999 } = {}) {
    this.geometry = new THREE.BufferGeometry();
    this.capacity = 0;
    this.count = 0;
    this._Allocate(2048);
    this.visibleMaterial = makeMaterial(true);
    this.occludedMaterial = xray ? makeMaterial(false) : null;
    this.visible = new Ctor(this.geometry, this.visibleMaterial);
    this.occluded = xray ? new Ctor(this.geometry, this.occludedMaterial) : null;
    const passes = [[this.visible, order, "Visible"]];
    if (this.occluded) passes.unshift([this.occluded, order - 2, "Occluded"]);
    for (const [object, renderOrder, suffix] of passes) {
      object.name = `${name}${suffix}`;
      object.frustumCulled = false;
      object.matrixAutoUpdate = false;
      object.renderOrder = renderOrder;
    }
  }
  get materials() { return this.occludedMaterial ? [this.visibleMaterial, this.occludedMaterial] : [this.visibleMaterial]; }
  _Allocate(capacity) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 4);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
  }
  Fill(chunks, key) {
    let vertices = 0;
    for (const chunk of chunks) vertices += chunk[key].length / 7;
    if (vertices > this.capacity) {
      this.geometry.dispose();
      this._Allocate(Math.max(vertices, this.capacity * 2));
    }
    let v = 0;
    for (const chunk of chunks) {
      const data = chunk[key];
      for (let i = 0; i < data.length; i += 7, v++) {
        this.positions[v * 3] = data[i]; this.positions[v * 3 + 1] = data[i + 1]; this.positions[v * 3 + 2] = data[i + 2];
        this.colors[v * 4] = data[i + 3]; this.colors[v * 4 + 1] = data[i + 4]; this.colors[v * 4 + 2] = data[i + 5]; this.colors[v * 4 + 3] = data[i + 6];
      }
    }
    this.count = v;
    const position = this.geometry.getAttribute("position"), color = this.geometry.getAttribute("color");
    position.needsUpdate = true; color.needsUpdate = true;
    position.clearUpdateRanges(); color.clearUpdateRanges();
    if (v) { position.addUpdateRange(0, v * 3); color.addUpdateRange(0, v * 4); }
    this.geometry.setDrawRange(0, v);
  }
  Dispose() { this.geometry.dispose(); for (const material of this.materials) material.dispose(); }
}

/**
 * 标记不压前景（2026-10-20，用户「标记的渲染队列会覆盖掉前景」）：叠加层与主场景共用一份深度，第一人称的手和枪
 * 也在里面（视图模型整支压到眼前 depthBudget 以内，游戏里 Script_Main 给的是 1.22 m）。原来穿墙那一遍不做深度测试，
 * 半透明地盖在枪和手上。现在两遍都做深度测试、片元深度最近只算到离眼 BLOCKOUT_FOREGROUND_M：
 *   看得见那一遍 —— 深度 = max(自己, 1.25 m 处)：比这还近的标记也排在手和枪后面；
 *   穿墙那一遍   —— 深度钉在 1.25 m 处：1.25 m 外的墙挡不住它（照旧穿墙），这以内的手 / 枪挡得住；
 *                   代价是贴脸 1.25 m 内的墙也不再被穿透（人都贴着墙了，越过去看就是）。
 * 不读预通道（白盒画质不跑预通道），只改 gl_FragDepth；depthWrite 本来就关着，不污染深度。
 */
export const BLOCKOUT_FOREGROUND_M = 1.25;
function BehindForeground(material, pin) {
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prior?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform mat4 projectionMatrix;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
  vec4 blockoutFgClip = projectionMatrix * vec4(0.0, 0.0, -${BLOCKOUT_FOREGROUND_M.toFixed(3)}, 1.0);
  float blockoutFgDepth = clamp(blockoutFgClip.z / blockoutFgClip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragDepth = ${pin ? "blockoutFgDepth" : "max(gl_FragCoord.z, blockoutFgDepth)"};`);
  };
  material.customProgramCacheKey = () => `${priorKey ? priorKey() : ""}|blockoutFg${pin ? "Pin" : "Max"}1`;
  material.depthTest = true;
  return material;
}
function MeshMaterial(depthTest) {
  return BehindForeground(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: depthTest ? 1 : 0.3,
    depthTest: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }), !depthTest);
}
/** 射界扇：离相机 surfaceNearM 以内的那部分扇面逐像素淡掉（顶点里算到相机的距离）。 */
function WithNearFade(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.blockoutFanNear = { value: BLOCKOUT_FAN.surfaceNearM };
    shader.uniforms.blockoutFanFar = { value: BLOCKOUT_FAN.surfaceFarM };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBlockoutFanCam;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvBlockoutFanCam = distance((modelMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBlockoutFanCam;\nuniform float blockoutFanNear;\nuniform float blockoutFanFar;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= smoothstep(blockoutFanNear, blockoutFanFar, vBlockoutFanCam);");
  };
  material.customProgramCacheKey = () => "blockoutFanNearFade1";
  return material;
}
/** 射界扇的填充：只做深度测试那一遍；贴地薄片往相机挪一点，免得和地面打架。 */
function FanMeshMaterial() {
  return BehindForeground(WithNearFade(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1,
    depthTest: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })), false);
}
function FanLineMaterial() {
  return BehindForeground(WithNearFade(RawLineMaterial(1)), false);
}
function RawLineMaterial(opacity) {
  return new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity,
    depthTest: true, depthWrite: false, toneMapped: false, fog: false });
}
function LineMaterial(depthTest) {
  return BehindForeground(RawLineMaterial(depthTest ? 1 : 0.3), !depthTest);
}

function IsMachineGun(unit) { return BLOCKOUT_MG_WEAPONS.includes(unit.weapon); }

export class BlockoutMarkers {
  constructor({ post, camera, groundAt, labelRoot }) {
    this.post = post;
    this.camera = camera;
    this.groundAt = groundAt;
    this.labelRoot = labelRoot;
    this.root = new THREE.Group();
    this.root.name = "BlockoutMarkers";
    this.tris = new DynamicLayer("BlockoutMarkerTris", THREE.Mesh, MeshMaterial);
    this.lines = new DynamicLayer("BlockoutMarkerLines", THREE.LineSegments, LineMaterial);
    // 射界扇单独两层：不穿墙、排在地环之前画（地环压在扇子上）
    this.fanTris = new DynamicLayer("BlockoutMarkerFanTris", THREE.Mesh, FanMeshMaterial, { xray: false, order: 995 });
    this.fanLines = new DynamicLayer("BlockoutMarkerFanLines", THREE.LineSegments, FanLineMaterial, { xray: false, order: 996 });
    this.layersAll = [this.fanTris, this.fanLines, this.tris, this.lines];
    this.root.add(this.tris.occluded, this.lines.occluded, this.fanTris.visible, this.fanLines.visible, this.tris.visible, this.lines.visible);
    const materials = this.layersAll.flatMap(layer => layer.materials);
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      const gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20);
      for (const material of materials) material.color.setScalar(gain);
    };
    if (post?.AddDebugOverlay) { post.AddDebugOverlay(this.root); this.host = "post"; }
    else { camera.parent?.add?.(this.root); this.host = "scene"; }
    this.layers = { ...BLOCKOUT_LAYER_DEFAULTS };
    this.units = [];
    this.pois = [];
    this.landmarks = [];
    this.stations = [];
    this.stationIndex = -1;
    this.next = null;
    this.chunks = new Map();     // key -> { sig, chunk }
    this.dirty = true;
    this.time = 0;
    this.labels = [];
    this.edge = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._camera = new THREE.Vector3();
    this.stats = { units: 0, tris: 0, lines: 0, fanTris: 0, fanLines: 0, fans: 0, labels: 0, landmarks: 0, stations: 0, landmarkLabels: 0, stationLabels: 0, unitLabels: 0 };
  }

  // -------------------------------------------------------------------------
  // 地标与站位（2026-10-20，§5.5）

  /** 场景文件的 landmarks（已过 NormalizeLandmarks）。开关「地标」关着时只记下来、不画。 */
  SetLandmarks(list) {
    this.landmarks = Array.isArray(list) ? list : [];
    this._RebuildLandmarks();
  }

  /**
   * 线框的淡填充离相机近了整片淡掉（石碾 2 m 外时那块填充会糊半个屏幕）：按地标到相机的距离算 0…1、量化到 0.1 一档，
   * 档位串变了才重建（相机走动时不是每帧重建）。线框本身不淡。
   */
  _LandmarkFades() {
    this.camera.getWorldPosition(this._camera);
    const cam = this._camera, D = BLOCKOUT_LANDMARK_DRAW;
    const fades = [];
    let sig = "";
    for (const lm of this.landmarks) {
      const d = Math.hypot(lm.x - cam.x, lm.z - cam.z) - Math.max(lm.w, lm.d) / 2;
      const f = Math.round(Math.min(1, Math.max(0, (d - D.fillFadeNearM) / (D.fillFadeFarM - D.fillFadeNearM))) * 10) / 10;
      fades.push(f);
      sig += f;
    }
    return { fades, sig };
  }

  _RebuildLandmarks() {
    if (!this.layers.landmarks || !this.landmarks.length) { if (this.chunks.delete("landmarks")) this.dirty = true; return; }
    const chunk = new Chunk(this.groundAt);
    const D = BLOCKOUT_LANDMARK_DRAW;
    const fades = this._LandmarkFades();
    this.landmarkSig = fades.sig;
    this.landmarks.forEach((lm, i) => {
      const ground = this.groundAt(lm.x, lm.z);
      const g = LandmarkGeometry(lm, ground);
      const line = Rgba(g.color, 0.95), fill = Rgba(g.color, D.fillAlpha * fades.fades[i]);
      if (g.box && g.dashed) {
        // 片区：贴地的虚线描边（不立 3D 盒子，主街 85 m 长的盒子会糊满街）
        const pts = [...g.box.corners, g.box.corners[0]].map(([x, z]) => ({ x, z }));
        chunk.Ribbon(pts, 0.14, Rgba(g.color, 0.75), { dash: [1.2, 0.8], lift: 0.07 });
      } else if (g.box) {
        const c = g.box.corners, y0 = g.box.y0, y1 = g.box.y1;
        for (let i = 0; i < 4; i++) {
          const a = c[i], b = c[(i + 1) % 4];
          chunk.Seg([a[0], y0, a[1]], [b[0], y0, b[1]], line);
          chunk.Seg([a[0], y1, a[1]], [b[0], y1, b[1]], line);
          chunk.Seg([a[0], y0, a[1]], [a[0], y1, a[1]], line);
          // 四个侧面淡淡填一层：远看是一块发光的盒子，近看线框还在
          chunk.Tri([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], fill);
          chunk.Tri([a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], fill);
        }
        chunk.Tri([c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], fill);
        chunk.Tri([c[0][0], y1, c[0][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]], fill);
      }
      if (g.ring) {
        const segments = Math.max(24, Math.min(96, Math.round(g.ring.r * 4)));
        chunk.Ring(lm.x, lm.z, g.ring.r, 0.14, Rgba(g.color, 0.8), { dash: g.dashed, segments });
      }
      // 细光柱 + 顶上两片交叉的小旗（哪个方向看都有一片是正面）
      chunk.Pillar(lm.x, lm.z, g.pillarM, 0, line, 1);
      const top = ground + g.pillarM, flag = D.flagM;
      chunk.Tri([lm.x, top, lm.z], [lm.x + flag, top - 0.13, lm.z], [lm.x, top - 0.3, lm.z], line);
      chunk.Tri([lm.x, top, lm.z], [lm.x, top - 0.13, lm.z + flag], [lm.x, top - 0.3, lm.z], line);
    });
    this.chunks.set("landmarks", { sig: "", chunk });
    this.dirty = true;
  }

  /** 这一关所有关键帧的玩家站位：[{ id, name, x, z, yawDeg }]，index = 当前关键帧。 */
  SetStations(list, index = -1) {
    this.stations = (Array.isArray(list) ? list : []).filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.z));
    this.stationIndex = Number.isInteger(index) ? index : -1;
    this._RebuildStations();
  }

  _RebuildStations() {
    if (!this.layers.stations || !this.stations.length) { if (this.chunks.delete("stations")) this.dirty = true; return; }
    const chunk = new Chunk(this.groundAt);
    const S = BLOCKOUT_STATION_DRAW;
    const route = this.stations.map(s => ({ x: s.x, z: s.z }));
    if (route.length >= 2) chunk.Ribbon(route, S.lineWidthM, Rgba(S.color, 0.55), { dash: S.dash, lift: 0.06 });
    this.stations.forEach((s, i) => {
      const current = i === this.stationIndex;
      const rgba = Rgba(current ? S.currentColor : S.color, current ? 0.98 : S.dimAlpha);
      const size = current ? S.currentTriM : S.triM;
      const yaw = Number.isFinite(s.yawDeg) ? s.yawDeg : 0;
      const fx = -Math.sin(yaw * DEG), fz = -Math.cos(yaw * DEG);
      chunk.ClampAround(s.x, s.z, UNIT_GROUND_CLAMP);
      chunk.Head({ x: s.x + fx * size * 0.55, z: s.z + fz * size * 0.55 }, { x: fx, z: fz }, size, rgba, 0.09);
      if (current) chunk.Ring(s.x, s.z, S.ringM, 0.1, Rgba(S.currentColor, 0.9), { segments: 28 });
      chunk.ClampAround(0, 0, null);
    });
    this.chunks.set("stations", { sig: "", chunk });
    this.dirty = true;
  }

  // -------------------------------------------------------------------------
  // 数据

  SetUnits(units) {
    this.units = units || [];
    const alive = new Set();
    this.camera.getWorldPosition(this._camera);
    const cam = this._camera;
    for (const unit of this.units) {
      const key = `u:${unit.id}`;
      alive.add(key);
      const arc = this.layers.arcs === "off" || this.layers.arcs === false ? null : unit.arc;
      // 射界扇起点离相机近了整片淡出（量化成档，相机走动时只在跨档时重建这一人）
      const fade = arc ? FanFade(Math.hypot(unit.x - cam.x, this.groundAt(unit.x, unit.z) + 0.14 - cam.y, unit.z - cam.z)) : 0;
      const sig = `${unit.x.toFixed(2)},${unit.z.toFixed(2)},${unit.yawDeg.toFixed(1)},${unit.visible !== false},${unit.side},${unit.kind},${unit.guess}`
        + `,${arc && fade > 0 ? `${arc.halfDeg},${arc.rangeM},${(arc.yawDeg ?? unit.yawDeg).toFixed(1)},${fade.toFixed(1)}` : "-"}`
        + `,${this.layers.intents && !unit.moving && unit.intent?.length ? unit.intent.map(p => `${p.x},${p.z}`).join(";") : "-"}`;
      const entry = this.chunks.get(key);
      if (entry && entry.sig === sig) continue;
      this.chunks.set(key, { sig, chunk: this._UnitChunk(unit, arc, fade) });
      this.dirty = true;
    }
    for (const key of [...this.chunks.keys()]) if (key.startsWith("u:") && !alive.has(key)) { this.chunks.delete(key); this.dirty = true; }
  }

  SetPois(pois) {
    this.pois = pois || [];
    const chunk = new Chunk(this.groundAt);
    for (const poi of this.pois) {
      const color = BLOCKOUT_MARKER_COLORS[poi.kind] || BLOCKOUT_MARKER_COLORS.poi;
      chunk.Pillar(poi.x, poi.z, 8, 0.06, Rgba(color, 0.95), 3);
      chunk.Ring(poi.x, poi.z, Math.max(0.6, poi.radiusM || 2), 0.12, Rgba(color, 0.85), { segments: 36 });
    }
    this.chunks.set("pois", { sig: "", chunk });
    this.dirty = true;
  }

  SetNext(next) {
    this.next = next && Number.isFinite(next.x) && Number.isFinite(next.z) ? { ...next } : null;
    if (!this.next) { this.chunks.delete("next"); this.dirty = true; }
  }

  SetLayers(layers) {
    const before = JSON.stringify(this.layers);
    Object.assign(this.layers, layers || {});
    if (this.layers.arcs === true) this.layers.arcs = "default";
    // 「标签」三档（2026-10-20）：true / false 也认
    this.layers.labels = LabelMode(this.layers.labels);
    if (JSON.stringify(this.layers) === before) return;
    for (const key of [...this.chunks.keys()]) if (key.startsWith("u:")) this.chunks.delete(key);
    // 射界扇没有穿墙那一遍，「穿墙显示」只管地环、箭头、光柱
    this.tris.occluded.visible = this.lines.occluded.visible = this.layers.xray !== false;
    this.SetUnits(this.units);
    this._RebuildLandmarks();
    this._RebuildStations();
    this.dirty = true;
  }

  _UnitChunk(unit, arc, fade = 1) {
    const chunk = new Chunk(this.groundAt);
    if (unit.visible === false) return chunk;
    const color = BLOCKOUT_MARKER_COLORS[unit.side] || BLOCKOUT_MARKER_COLORS.nra;
    const ring = RING_RADIUS[unit.kind] || RING_RADIUS.soldier;
    // 地环与朝向箭头压在脚下（贴沟壁站的人，地环不顺着沟壁竖起来）
    chunk.ClampAround(unit.x, unit.z, UnitClamp(ring));
    chunk.Ring(unit.x, unit.z, ring, unit.kind === "tank" ? 0.2 : 0.11, Rgba(color, 0.95), { dash: !!unit.guess, segments: unit.kind === "tank" ? 40 : 24 });
    // 朝向短箭头：从地环边上伸出去
    const fx = -Math.sin(unit.yawDeg * DEG), fz = -Math.cos(unit.yawDeg * DEG);
    const reach = ring + (unit.kind === "tank" ? 2.2 : 0.9);
    const start = { x: unit.x + fx * ring, z: unit.z + fz * ring }, tip = { x: unit.x + fx * reach, z: unit.z + fz * reach };
    chunk.Ribbon([start, { x: tip.x - fx * 0.25, z: tip.z - fz * 0.25 }], 0.1, Rgba(color, 0.95));
    chunk.Head(tip, { x: fx, z: fz }, unit.kind === "tank" ? 0.9 : 0.42, Rgba(color, 0.95));
    chunk.ClampAround(0, 0, null);
    if (arc && fade > 0) {
      chunk.Fan(unit.x, unit.z, arc.yawDeg ?? unit.yawDeg, arc.halfDeg, arc.rangeM,
        Rgba(color, BLOCKOUT_FAN.fillAlpha * fade), Rgba(color, BLOCKOUT_FAN.edgeAlpha * fade));
    }
    if (this.layers.intents && !unit.moving && unit.intent?.length) {
      const route = [{ x: unit.x, z: unit.z }, ...unit.intent];
      chunk.Ribbon(route, 0.16, Rgba(color, 0.9), { dash: [1.1, 0.8] });
      const a = route[route.length - 2], b = route[route.length - 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len > 0.2) chunk.Head(b, { x: (b.x - a.x) / len, z: (b.z - a.z) / len }, 0.9, Rgba(color, 0.95));
    }
    return chunk;
  }

  /** 地环闪一下（§5.2：原地出现 / 过渡开始时消失的人）。 */
  Flash(x, z, side) {
    this.flashes = (this.flashes || []).filter(f => this.time - f.t0 < FLASH_S);
    this.flashes.push({ x, z, color: BLOCKOUT_MARKER_COLORS[side] || BLOCKOUT_MARKER_COLORS.nra, t0: this.time });
  }

  _FlashChunk() {
    const chunk = new Chunk(this.groundAt);
    for (const f of this.flashes) {
      const k = (this.time - f.t0) / FLASH_S;
      if (k < 0 || k >= 1) continue;
      chunk.ClampAround(f.x, f.z, UNIT_GROUND_CLAMP);
      chunk.Ring(f.x, f.z, 0.5 + 1.6 * k, 0.16, Rgba(f.color, 0.95 * (1 - k)), { segments: 24 });
    }
    return chunk;
  }

  _NextChunk() {
    const n = this.next;
    const chunk = new Chunk(this.groundAt);
    const gold = BLOCKOUT_MARKER_COLORS.next;
    chunk.Pillar(n.x, n.z, 14, 0.16, Rgba(gold, 1), 6);
    const base = Math.max(0.8, n.radiusM || 3);
    const breath = 1 + 0.1 * Math.sin(this.time * 3.2);
    chunk.Ring(n.x, n.z, base * breath, 0.18, Rgba(gold, 0.95), { segments: 40 });
    chunk.Ring(n.x, n.z, base * 0.35, 0.1, Rgba(gold, 0.7), { segments: 20 });
    return chunk;
  }

  _Rebuild() {
    const chunks = [...this.chunks.values()].map(entry => entry.chunk);
    this.tris.Fill(chunks, "tri");
    this.lines.Fill(chunks, "line");
    this.fanTris.Fill(chunks, "fanTri");
    this.fanLines.Fill(chunks, "fanLine");
    this.dirty = false;
    this.stats.tris = this.tris.count / 3;
    this.stats.lines = this.lines.count / 2;
    this.stats.fanTris = this.fanTris.count / 3;
    this.stats.fanLines = this.fanLines.count / 2;
    this.stats.fans = chunks.filter(chunk => chunk.fanTri.length).length;
    this.stats.units = this.units.length;
    this.stats.landmarks = this.chunks.has("landmarks") ? this.landmarks.length : 0;
    this.stats.stations = this.chunks.has("stations") ? this.stations.length : 0;
  }

  /** 取证：此刻挂在屏幕上的 DOM 标签文字（按层分），测试用。 */
  LabelInfo() {
    const out = { units: [], pois: [], landmarks: [], stations: [], next: [] };
    for (const el of this.labels) {
      if (!el || el.style.display === "none") continue;
      const layer = el.dataset.layer || "units";
      (out[layer] || out.units).push(el._text.textContent);
    }
    return out;
  }

  /** 取证：现在场上画了哪些扇子、各自的淡出系数（测试用）。 */
  FanInfo() {
    const out = [];
    for (const [key, entry] of this.chunks) {
      if (!key.startsWith("u:") || !entry.chunk.fanTri.length) continue;
      out.push({ id: key.slice(2), alpha: entry.chunk.fanTri[6] });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // 每帧

  /** 预演播放中整层藏起来（3D 地环 / 射界 / 光柱；头顶标签由总控藏 labelRoot）。2026-10-18。 */
  SetHidden(hidden) {
    this.hidden = !!hidden;
    this.root.visible = !this.hidden;
  }

  Update(dt) {
    this.time += dt;
    if (this.hidden) return;
    if (this.next) { this.chunks.set("next", { sig: "", chunk: this._NextChunk() }); this.dirty = true; }
    // 地标的淡填充按离相机的距离淡出（跨档才重建，2026-10-20）
    if (this.layers.landmarks && this.landmarks.length && this.chunks.has("landmarks") && this._LandmarkFades().sig !== this.landmarkSig) this._RebuildLandmarks();
    if (this.flashes?.length) {
      this.flashes = this.flashes.filter(f => this.time - f.t0 < FLASH_S);
      this.chunks.set("flash", { sig: "", chunk: this._FlashChunk() });
      this.dirty = true;
    } else if (this.chunks.has("flash")) { this.chunks.delete("flash"); this.dirty = true; }
    if (this.dirty) this._Rebuild();
    this._UpdateLabels();
  }

  _Project(x, y, z) {
    const camera = this.camera;
    this._w.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const behind = this._w.z >= 0;
    this._v.set(x, y, z).project(camera);
    const w = innerWidth, h = innerHeight;
    return { sx: (this._v.x * 0.5 + 0.5) * w, sy: (-this._v.y * 0.5 + 0.5) * h, behind,
      onScreen: !behind && Math.abs(this._v.x) < 1 && Math.abs(this._v.y) < 1, ndcX: this._v.x, ndcY: this._v.y };
  }

  _Label(index) {
    let el = this.labels[index];
    if (!el) {
      el = document.createElement("div");
      el.className = "blockoutLabel";
      el.style.cssText = "position:absolute;left:0;top:0;display:none;align-items:center;gap:5px;white-space:nowrap;"
        + "font:12px/16px var(--ui-font, system-ui, sans-serif);color:#eef0ea;padding:1px 6px 1px 4px;"
        + "background:rgba(10,13,14,.62);border:1px solid rgba(196,198,187,.22);pointer-events:none;will-change:transform;";
      const dot = document.createElement("i");
      dot.style.cssText = "display:inline-block;width:8px;height:8px;flex:none;";
      const text = document.createElement("span");
      // 地标的一行小字（note），2026-10-20
      const note = document.createElement("span");
      note.style.cssText = "display:none;font-size:10px;line-height:14px;color:#b4b7aa;margin-left:2px;";
      el.append(dot, text, note);
      el._dot = dot; el._text = text; el._note = note;
      this.labelRoot.appendChild(el);
      this.labels[index] = el;
    }
    return el;
  }

  /** 地标与站位的标签候选（2026-10-20）；推进 candidates。 */
  _ExtraLabelCandidates(candidates, cx, cz) {
    if (this.layers.landmarks && this.landmarks.length) {
      const D = BLOCKOUT_LANDMARK_DRAW;
      for (const lm of this.landmarks) {
        const distance = Math.hypot(lm.x - cx, lm.z - cz);
        if (distance > D.labelFarM) continue;
        const g = LandmarkGeometry(lm, this.groundAt(lm.x, lm.z));
        // 走近了（10 m 内）有线框的标签挂在线框顶上，不然 3.4 m 高的柱顶在第一人称里早出了画面
        const labelY = distance < D.nearLabelM && g.box ? g.box.y1 + D.labelLiftM : g.labelY;
        const p = this._Project(lm.x, labelY, lm.z);
        if (!p.onScreen) continue;
        candidates.push({ p, distance, color: g.color, text: lm.name, note: lm.note || "", shape: "square", priority: 1, layer: "landmarks" });
      }
    }
    if (this.layers.stations && this.stations.length) {
      const S = BLOCKOUT_STATION_DRAW;
      this.stations.forEach((s, i) => {
        const distance = Math.hypot(s.x - cx, s.z - cz);
        if (distance > S.labelFarM || distance < S.skipNearM) return;
        const current = i === this.stationIndex;
        const p = this._Project(s.x, this.groundAt(s.x, s.z) + S.labelLiftM, s.z);
        if (!p.onScreen) return;
        candidates.push({ p, distance, color: current ? S.currentColor : S.color, text: StationLabel(s), shape: "dot", priority: current ? 1 : 0, layer: "stations", dim: !current });
      });
    }
  }

  _UpdateLabels() {
    if (!this.labelRoot || typeof document === "undefined") return;
    const camera = this.camera;
    camera.getWorldPosition(this._camera);
    const cx = this._camera.x, cz = this._camera.z;
    const candidates = [];
    const labelMode = LabelMode(this.layers.labels);
    if (labelMode !== "off") {
      // 三档（2026-10-20）：named = 有名字的才有字（无名机枪写「机枪」），all = 无名的按身份兜底、同类带 id 尾号
      const texts = UnitLabelTexts(this.units, labelMode);
      for (const unit of this.units) {
        if (unit.visible === false) continue;
        const distance = Math.hypot(unit.x - cx, unit.z - cz);
        const named = !!unit.name;
        if (distance > LABEL_FAR_M && !named && !IsMachineGun(unit)) continue;
        const y = this.groundAt(unit.x, unit.z) + (HEAD_Y[unit.kind] || 2) + (unit.stance === "prone" ? -1.2 : unit.stance === "crouch" ? -0.5 : 0);
        const p = this._Project(unit.x, y, unit.z);
        if (!p.onScreen) continue;
        candidates.push({ p, distance, color: BLOCKOUT_MARKER_COLORS[unit.side] || "#fff", text: texts.get(unit.id) || "",
          shape: unit.side === "ija" ? "tri" : "dot", guess: !!unit.guess, priority: named ? 1 : 0, layer: "units" });
      }
      for (const poi of this.pois) {
        const distance = Math.hypot(poi.x - cx, poi.z - cz);
        const p = this._Project(poi.x, this.groundAt(poi.x, poi.z) + 8.4, poi.z);
        if (!p.onScreen || !poi.name) continue;
        candidates.push({ p, distance, color: BLOCKOUT_MARKER_COLORS[poi.kind] || BLOCKOUT_MARKER_COLORS.poi, text: poi.name, shape: "diamond", priority: 1, layer: "pois" });
      }
    }
    let nextLabel = null;
    if (this.next) {
      const n = this.next;
      const distance = Math.hypot(n.x - cx, n.z - cz);
      const p = this._Project(n.x, this.groundAt(n.x, n.z) + 14.4, n.z);
      const text = `下一步 · ${n.text || ""} · ${Math.round(distance)} m`;
      if (p.onScreen) candidates.push({ p, distance: -1, color: BLOCKOUT_MARKER_COLORS.next, text, shape: "diamond", priority: 2, next: true });
      else nextLabel = { p, text };
    }
    // 地标与站位的标签（2026-10-20）；开关关着时不进候选
    this._ExtraLabelCandidates(candidates, cx, cz);
    // 近的先排；同距离时有名字的、下一步优先
    candidates.sort((a, b) => (b.priority === 2) - (a.priority === 2) || a.distance - b.distance);
    const placed = [];
    let used = 0;
    const counts = { units: 0, landmarks: 0, stations: 0 };
    for (const c of candidates) {
      const width = 22 + (c.text ? c.text.length * 12 : 0) + (c.note ? c.note.length * 10 + 4 : 0), height = 18;
      let x = c.p.sx - width / 2, y = c.p.sy - height;
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const yy = y - attempt * (height + 2);
        if (!placed.some(r => x < r.x + r.w && x + width > r.x && yy < r.y + r.h && yy + height > r.y)) { y = yy; ok = true; }
      }
      if (!ok) continue;
      placed.push({ x, y, w: width, h: height });
      const el = this._Label(used++);
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.borderColor = c.next ? "rgba(223,189,104,.7)" : "rgba(196,198,187,.22)";
      el._dot.style.background = c.shape === "tri" ? "transparent" : c.color;
      el._dot.style.borderRadius = c.shape === "dot" ? "50%" : "0";
      el._dot.style.transform = c.shape === "diamond" ? "rotate(45deg) scale(.8)" : "none";
      el._dot.style.borderLeft = c.shape === "tri" ? "5px solid transparent" : "0";
      el._dot.style.borderRight = c.shape === "tri" ? "5px solid transparent" : "0";
      el._dot.style.borderBottom = c.shape === "tri" ? `9px solid ${c.color}` : "0";
      el._dot.style.width = c.shape === "tri" ? "0" : "8px";
      el._dot.style.height = c.shape === "tri" ? "0" : "8px";
      el._dot.style.outline = c.guess ? `1px dashed ${c.color}` : "none";
      el._text.textContent = c.text;
      el._text.style.display = c.text ? "" : "none";
      el.style.padding = c.text ? "1px 6px 1px 4px" : "3px";
      // 地标 / 站位（2026-10-20）：方点、小字 note、淡的站位、层名给取证用
      if (c.shape === "square") { el._dot.style.borderRadius = "0"; el._dot.style.transform = "none"; el._dot.style.width = "8px"; el._dot.style.height = "8px"; }
      el._note.textContent = c.note || "";
      el._note.style.display = c.note ? "" : "none";
      el.style.opacity = c.dim ? "0.72" : "";
      el._text.style.color = c.layer === "landmarks" ? c.color : c.layer === "stations" ? c.color : "";
      el.dataset.layer = c.layer || "units";
      counts[c.layer || "units"] = (counts[c.layer || "units"] || 0) + 1;
    }
    for (let i = used; i < this.labels.length; i++) if (this.labels[i].style.display !== "none") this.labels[i].style.display = "none";
    this.stats.labels = used;
    this.stats.unitLabels = counts.units;
    this.stats.landmarkLabels = counts.landmarks;
    this.stats.stationLabels = counts.stations;
    this._UpdateEdge(nextLabel);
  }

  /** 下一步目标在屏幕外：贴边箭头 + 文字。 */
  _UpdateEdge(next) {
    if (!next) { if (this.edge) this.edge.style.display = "none"; return; }
    if (!this.edge) {
      const el = document.createElement("div");
      el.className = "blockoutEdgeNext";
      el.style.cssText = "position:absolute;left:0;top:0;display:none;align-items:center;gap:6px;white-space:nowrap;pointer-events:none;"
        + "font:12px/16px var(--ui-font, system-ui, sans-serif);color:#f4e2b0;background:rgba(10,13,14,.7);"
        + "border:1px solid rgba(223,189,104,.6);padding:2px 8px 2px 4px;";
      const arrow = document.createElement("i");
      arrow.style.cssText = "display:inline-block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;"
        + "border-bottom:11px solid #dfbd68;flex:none;";
      const text = document.createElement("span");
      el.append(arrow, text);
      el._arrow = arrow; el._text = text;
      this.labelRoot.appendChild(el);
      this.edge = el;
    }
    const w = innerWidth, h = innerHeight, margin = 70;
    let dx = next.p.ndcX, dy = -next.p.ndcY;
    if (next.p.behind) { dx = -dx; dy = -dy; }
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = 1;
    const scale = Math.min((w / 2 - margin) / Math.max(1e-4, Math.abs(dx * w / 2)), (h / 2 - margin) / Math.max(1e-4, Math.abs(dy * h / 2)));
    const x = w / 2 + dx * w / 2 * scale, y = h / 2 + dy * h / 2 * scale;
    const angle = Math.atan2(dy * h, dx * w) * 180 / Math.PI + 90;
    const el = this.edge;
    el.style.display = "flex";
    el._text.textContent = next.text;
    el._arrow.style.transform = `rotate(${Math.round(angle)}deg)`;
    const width = 30 + next.text.length * 12;
    el.style.transform = `translate(${Math.round(Math.max(8, Math.min(w - width - 8, x - width / 2)))}px, ${Math.round(Math.max(8, Math.min(h - 30, y - 10)))}px)`;
  }

  Dispose() {
    if (this.host === "post") this.post?.RemoveDebugOverlay?.(this.root);
    else this.root.removeFromParent();
    for (const layer of this.layersAll) layer.Dispose();
    this.root.clear();
    for (const el of this.labels) el.remove();
    this.labels.length = 0;
    this.edge?.remove();
    this.edge = null;
    this.chunks.clear();
  }
}
