// 《地下长城 · 冀中1942》 —— three.js 白盒渲染器（表现层，AGENTS.md §六）。
//
// 职责：双层六角战场（地上 y=0 挤出地块 / 地下 y=-6 发光管线网络）、双主态视图切换
// 与 Space 窥视、格上徽记（合批 quad，每格 ≤3、数字不上格）、单位（形状+色+字符徽）、
// 拾取（当前层优先 / Alt 跨层）、可达高亮与路径预览、俯角 55° 锁定相机（3 档缩放）、
// 敌阶段播报聚焦动画。
//
// 纪律：
//   · 不自己算规则——一切输入来自 Script_Main 归一化后的 vm（DeriveView 或夹具）。
//   · 颜色只引用 Data_Theme.mjs；three r152+ 色彩只转换一次（new THREE.Color(css) 即完成
//     sRGB→Linear，全文件禁再叠 convertSRGBToLinear）。
//   · 单一渲染路径、无画质分档、无后处理；六角与徽记 Instanced/合批。
//   · 模块顶层零 DOM/WebGL 副作用：全部在 CreateRenderer() 内部。
//
// vm 契约（由 Script_Main 保证，engine/夹具同构）：
//   { revision, hexes:{key:{terrain,road,roadBroken,bridge,villageId,traces,searched,attackSite}},
//     villages:{id:{name,hexKeys,hasHq}},
//     tunnels:{cells,edges,entrances,vents,digs},
//     units:[{id,side,type,hp,mp,acted,layer,pos,stance,revealed}],   // 已按可见性过滤！
//     ghosts:[{pos,type}], intents:[{pos,path:[key],question}] }

import * as THREE from "three";
import {
  hexSize, HexKey, ParseHexKey, HexToWorld, WorldToHex, HexCornerOffsets,
  Clamp, Clamp01, Lerp,
} from "./Script_Hex.mjs";
import { theme, EntranceTier, EntranceTierColor } from "./Data_Theme.mjs";

// ---------------------------------------------------------------------------
// 常量（纯数据，无副作用）
// ---------------------------------------------------------------------------

const cameraPitchRad = (55 * Math.PI) / 180;       // 俯角 55° 锁定（§六.6）
const zoomDistances = Object.freeze([8.5, 13.5, 20]); // 滚轮 3 档
const underY = theme.under.depthY;

/** 徽记图集字形排布（8×8 格，64px/格）。 */
const glyphNames = Object.freeze([
  "beadHollow", "beadFilled", "dot", "ring0", "ring50", "puff", "cross", "question",
  "民", "游", "联", "日", "伪", "特", "工", "众",
  "储", "藏", "风", "枪", "门", "部", "搜", "袭",
]);

/** 徽记行内每格本地槽位（北缘向内排，单位徽记让开格心）。 */
const badgeSlots = Object.freeze([
  Object.freeze({ x: 0, z: -0.68 }),
  Object.freeze({ x: 0, z: -0.46 }),
  Object.freeze({ x: 0, z: -0.25 }),
]);

function TerrainOf(hex) {
  return theme.surface.terrains[hex.terrain] ?? theme.surface.terrains.open;
}

function EdgeKeyPair(edgeKey) {
  const bar = edgeKey.indexOf("|");
  return [edgeKey.slice(0, bar), edgeKey.slice(bar + 1)];
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function CreateRenderer({ canvas }) {
  // ---------------- 基础设施 ----------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.scene.background);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  const camState = {
    target: new THREE.Vector3(0, 0, 0),
    zoomIndex: 1,
    zoomCurrent: zoomDistances[1],
    focusTween: null,           // {fromT,toT,elapsed,duration,resolve}
    bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
  };

  scene.add(new THREE.AmbientLight(new THREE.Color(theme.scene.ambient), theme.scene.ambientIntensity));
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(theme.scene.hemiSky), new THREE.Color(theme.scene.hemiGround), theme.scene.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(theme.scene.sun), theme.scene.sunIntensity);
  sun.position.set(6, 14, 4);
  scene.add(sun);

  // ---------------- 分组 ----------------
  const gSurface = new THREE.Group();    // 地块 + 网格 + 道具 + 道路
  const gRoof = new THREE.Group();       // 地下态的屋顶线框
  const gUnder = new THREE.Group();      // 地下网络（透地渲染：depthTest=false + renderOrder）
  const gAlways = new THREE.Group();     // 入口色环 / 通风白杆（两层常显）
  const gBadgeSurface = new THREE.Group();
  const gBadgeUnder = new THREE.Group();
  const gIntent = new THREE.Group();
  const gUnitSurface = new THREE.Group();
  const gUnitUnder = new THREE.Group();
  const gOverlay = new THREE.Group();    // 可达 / 路径 / 悬停 / 选中 / 聚焦脉冲
  scene.add(gSurface, gRoof, gUnder, gAlways, gBadgeSurface, gBadgeUnder, gIntent, gUnitSurface, gUnitUnder, gOverlay);

  // ---------------- 共享几何 ----------------
  const cornerOffsets = HexCornerOffsets(hexSize * 0.985);
  const hexPrism = BuildHexPrismGeometry(cornerOffsets, theme.surface.sideShade);
  const hexTile = BuildHexTileGeometry(HexCornerOffsets(hexSize * 0.92));
  const ringGeom = new THREE.TorusGeometry(0.42, 0.055, 8, 24);
  ringGeom.rotateX(Math.PI / 2);
  // 六边形「带宽轮廓」：12 顶点 12 三角的扁平环——替代 WebGL 下恒为 1px 的 LineBasicMaterial。
  const hexRingReach = BuildHexRingGeometry(0.93, theme.highlight.edgeWidth);
  const hexRingHover = BuildHexRingGeometry(0.985, theme.highlight.hoverWidth);
  const hexRingDest = BuildHexRingGeometry(0.93, theme.highlight.edgeWidth * 1.5);
  const destRingGeom = new THREE.TorusGeometry(0.5, 0.075, 8, 30);
  destRingGeom.rotateX(Math.PI / 2);
  const pathArrowGeom = new THREE.ConeGeometry(theme.highlight.pathRadius * 2.4, theme.highlight.pathRadius * 4.4, 5);
  pathArrowGeom.rotateX(Math.PI / 2);   // 锥尖指向 +Z，便于用 lookAt 摆向
  const pathJointGeom = new THREE.SphereGeometry(theme.highlight.pathRadius * 1.05, 8, 6);
  const costPlaneGeom = new THREE.PlaneGeometry(1, 1);
  const unitGeoms = {
    box: new THREE.BoxGeometry(0.5, 0.48, 0.5),
    cylinder: new THREE.CylinderGeometry(0.28, 0.32, 0.6, 6),
    sphere: new THREE.SphereGeometry(0.28, 12, 10),
    cone: new THREE.ConeGeometry(0.32, 0.7, 6),
    coneShort: new THREE.ConeGeometry(0.32, 0.46, 6),
    disc: new THREE.CylinderGeometry(0.32, 0.36, 0.18, 12),
    coneBox: null, // 组合形：锥 + 背箱，见 CreateUnitMesh
  };
  const shapeLift = { box: 0.24, cylinder: 0.3, sphere: 0.34, cone: 0.35, coneShort: 0.23, disc: 0.09, coneBox: 0.35 };

  // ---------------- 材质（亮度/透明度每帧统一驱动） ----------------
  const matHex = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  const matGrid = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.surface.grid), transparent: true, opacity: 0.85 });
  const matRoof = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.surface.roofWire), transparent: true, opacity: 0 });
  matRoof.depthTest = false;
  const matRoad = new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.surface.road), transparent: true, side: THREE.DoubleSide });
  const matProps = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });

  const matPad = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.under.cellPad), transparent: true, depthTest: false });
  const matPadEdge = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.under.cellEdge), transparent: true, depthTest: false });
  const matTube = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.under.edgeTube), transparent: true, depthTest: false });
  const matTopo = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.under.edgeLine), transparent: true, depthTest: false });
  const matShaft = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.under.shaft), transparent: true, depthTest: false });
  const matFacility = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });   // instanceColor
  const matDoor = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });       // instanceColor
  const matSmoke = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.under.smoke), transparent: true, depthTest: false });
  const matRing = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });       // instanceColor（地表环，常显）
  const matRingUnder = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });  // 地下环，随地下亮度
  const matVent = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.under.ventPole), transparent: true, depthTest: false });
  const matVentUnder = matVent.clone();

  // 可达覆膜 + 可达描边：两张 InstancedMesh（instanceColor 承担档位差异，避免逐格建几何体）
  const matReachFill = new THREE.MeshBasicMaterial({
    transparent: true, opacity: theme.highlight.reachableOpacity, depthTest: false, depthWrite: false });
  const matReachEdge = new THREE.MeshBasicMaterial({
    transparent: true, opacity: theme.highlight.edgeOpacity, depthTest: false, depthWrite: false });
  const matPath = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.path), transparent: true, opacity: 0.96, depthTest: false });
  const matPathRisk = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.pathRisk), transparent: true, opacity: 0.96, depthTest: false });
  const matPathArrow = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.pathArrow), transparent: true, opacity: 0.98, depthTest: false });
  const matDest = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.dest), transparent: true, opacity: 0.95, depthTest: false });
  const matDestOutline = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.dest), transparent: true, opacity: 0.9, depthTest: false });
  const matCost = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, opacity: 1 });
  const matHover = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.hover), transparent: true, opacity: 0.9, depthTest: false });
  const matSelect = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.selection), transparent: true, opacity: 0.95, depthTest: false });
  const matFocus = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.highlight.focus), transparent: true, opacity: 0, depthTest: false });
  const matIntent = new THREE.LineDashedMaterial({
    color: new THREE.Color(theme.badges.intent), transparent: true, opacity: 0.95,
    dashSize: 0.22, gapSize: 0.14, depthTest: false });
  const matIntentHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.badges.intent), transparent: true, opacity: 0.95, depthTest: false });

  // 徽记图集
  const atlas = BuildGlyphAtlas();
  const matBadgeSurface = new THREE.MeshBasicMaterial({
    map: atlas.texture, transparent: true, vertexColors: true, depthTest: false, alphaTest: 0.05 });
  const matBadgeUnder = matBadgeSurface.clone();

  // renderOrder 层级：地下内容透地绘制
  gUnder.renderOrder = 4;
  gBadgeUnder.renderOrder = 7;
  gUnitUnder.renderOrder = 8;
  gAlways.renderOrder = 9;
  gIntent.renderOrder = 3;
  gBadgeSurface.renderOrder = 6;
  gOverlay.renderOrder = 10;

  // ---------------- 视图状态 ----------------
  const viewState = {
    layer: "surface",
    peek: false,
    eff: {                       // 每帧向目标推进的有效值
      surfaceOpacity: { value: 1, target: 1 },
      underBrightness: { value: theme.layerMix.underBrightnessSurface, target: theme.layerMix.underBrightnessSurface },
      surfaceUnitOpacity: { value: 1, target: 1 },
    },
    vm: null,
    heights: new Map(),          // hexKey -> 顶面高度
    hexKeys: [],
    selection: null,             // {unitId?, hexKey?, layer}
    hoverKey: null,
    hoverLayer: "surface",
    reachable: [],
    path: null,                  // {path:[key], riskFrom}
    unitVisuals: new Map(),      // unitId -> {root, body, ring, sprite, tween}
    ghostMeshes: [],
    focusPulse: { mesh: null, t: 1 },
    statsFrames: 0, statsTime: 0, fps: 0,
  };

  const disposables = [];        // SetView 动态对象（每次重建先清）
  const mapDisposables = [];     // SetMap 静态对象

  // =========================================================================
  // 几何构建工具
  // =========================================================================

  function BuildHexPrismGeometry(corners, sideShade) {
    // 顶面 4 三角扇 + 6 侧壁；顶点色区分顶/侧（instanceColor 相乘得终色）。
    // 注意绕序：角点按角度增序排列（x=cosθ, z=sinθ），在 y 向上、俯视 -y 的坐标系里
    // 这是屏幕上的顺时针——顶面扇必须取 (0, i+1, i) 才是正面朝上，否则整片顶面被背面剔除，
    // 画面表现为「地块全黑、只剩透进去的内壁」（实测踩过）。
    const positions = [];
    const normals = [];
    const colors = [];
    const top = 1;               // 单位高，实例矩阵 scaleY
    for (let i = 1; i < 5; i += 1) {  // 顶面扇（0, i+1, i）
      positions.push(corners[0].x, top, corners[0].z, corners[i + 1].x, top, corners[i + 1].z, corners[i].x, top, corners[i].z);
      for (let k = 0; k < 3; k += 1) { normals.push(0, 1, 0); colors.push(1, 1, 1); }
    }
    for (let i = 0; i < 6; i += 1) {  // 侧壁（从外侧看正面）
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const nx = (a.x + b.x) / 2;
      const nz = (a.z + b.z) / 2;
      const len = Math.hypot(nx, nz) || 1;
      const quad = [
        [a.x, top, a.z], [b.x, top, b.z], [a.x, 0, a.z],
        [b.x, top, b.z], [b.x, 0, b.z], [a.x, 0, a.z],
      ];
      for (const p of quad) {
        positions.push(p[0], p[1], p[2]);
        normals.push(nx / len, 0, nz / len);
        colors.push(sideShade, sideShade, sideShade);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function BuildHexTileGeometry(corners) {
    const positions = [];
    for (let i = 1; i < 5; i += 1) {   // 绕序同上：(0, i+1, i) 正面朝上
      positions.push(corners[0].x, 0, corners[0].z, corners[i + 1].x, 0, corners[i + 1].z, corners[i].x, 0, corners[i].z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  /** 六边形环带（扁平 annulus，位于 y=0 平面）：outer 为外轮廓缩放，width 为带宽（世界单位）。
   *  WebGL 下 LineBasicMaterial.linewidth 恒为 1px，「描边」必须是真几何体才看得见。 */
  function BuildHexRingGeometry(outerScale, width) {
    const outer = HexCornerOffsets(hexSize * outerScale);
    const innerScale = Math.max(0.05, outerScale - width / hexSize);
    const inner = HexCornerOffsets(hexSize * innerScale);
    const positions = [];
    for (let i = 0; i < 6; i += 1) {
      const j = (i + 1) % 6;
      // 每条边一个四边形（外 i、外 j、内 j、内 i），绕序保证正面朝上（+Y）
      positions.push(
        outer[i].x, 0, outer[i].z, inner[i].x, 0, inner[i].z, outer[j].x, 0, outer[j].z,
        outer[j].x, 0, outer[j].z, inner[i].x, 0, inner[i].z, inner[j].x, 0, inner[j].z,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function HexOutlinePositions(key, y, scale = 0.985) {
    const { q, r } = ParseHexKey(key);
    const center = HexToWorld(q, r);
    const corners = HexCornerOffsets(hexSize * scale);
    const out = [];
    for (let i = 0; i < 6; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      out.push(center.x + a.x, y, center.z + a.z, center.x + b.x, y, center.z + b.z);
    }
    return out;
  }

  function TopY(key) {
    return viewState.heights.get(key) ?? 0.35;
  }

  function LayerY(key, layer) {
    return layer === "under" ? underY + 0.06 : TopY(key) + 0.02;
  }

  // =========================================================================
  // 徽记图集与合批
  // =========================================================================

  function BuildGlyphAtlas() {
    const cell = 64;
    const cols = 8;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = cell * cols;
    canvasEl.height = cell * Math.ceil(glyphNames.length / cols);
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    glyphNames.forEach((name, index) => {
      const cx = (index % cols) * cell + cell / 2;
      const cy = Math.floor(index / cols) * cell + cell / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = theme.badges.atlasBase;
      ctx.fillStyle = theme.badges.atlasBase;
      ctx.lineWidth = 6;
      if (name === "beadHollow") {
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
      } else if (name === "beadFilled") {
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
      } else if (name === "dot") {
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      } else if (name === "ring0") {
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      } else if (name === "ring50") {
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 16, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
      } else if (name === "puff") {
        for (const [dx, dy, radius] of [[-10, 6, 11], [0, -6, 13], [11, 5, 11]]) {
          ctx.beginPath(); ctx.arc(dx, dy, radius, 0, Math.PI * 2); ctx.fill();
        }
      } else if (name === "cross") {
        ctx.lineWidth = 9; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(14, 14); ctx.moveTo(14, -14); ctx.lineTo(-14, 14); ctx.stroke();
      } else if (name === "question") {
        ctx.font = "bold 46px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("?", 0, 2);
      } else {
        ctx.font = "bold 44px 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(name, 0, 3);
      }
      ctx.restore();
    });
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    const uvOf = (name) => {
      const index = glyphNames.indexOf(name);
      const col = index % cols;
      const row = Math.floor(index / cols);
      const rows = Math.ceil(glyphNames.length / cols);
      return { u0: col / cols, v0: 1 - (row + 1) / rows, u1: (col + 1) / cols, v1: 1 - row / rows };
    };
    return { texture, uvOf };
  }

  /** 徽记合批：quads=[{x,y,z,size,glyph,color}] → 单一 Mesh（面向固定俯角相机）。 */
  function BuildBadgeMesh(quads, material) {
    const count = quads.length;
    const positions = new Float32Array(count * 12);
    const uvs = new Float32Array(count * 8);
    const colors = new Float32Array(count * 12);
    const indices = [];
    // 相机朝向固定（俯角 55°、无旋转）：广告牌基向量可静态预计算。
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, Math.cos(cameraPitchRad), -Math.sin(cameraPitchRad));
    const color = new THREE.Color();
    quads.forEach((quad, qi) => {
      const half = quad.size / 2;
      const cx = quad.x, cy = quad.y, cz = quad.z;
      const rx = right.x * half, ry = right.y * half, rz = right.z * half;
      const ux = up.x * half, uy = up.y * half, uz = up.z * half;
      const base = qi * 12;
      // 左下 右下 左上 右上
      positions.set([
        cx - rx - ux, cy - ry - uy, cz - rz - uz,
        cx + rx - ux, cy + ry - uy, cz + rz - uz,
        cx - rx + ux, cy - ry + uy, cz - rz + uz,
        cx + rx + ux, cy + ry + uy, cz + rz + uz,
      ], base);
      const uv = atlas.uvOf(quad.glyph);
      uvs.set([uv.u0, uv.v0, uv.u1, uv.v0, uv.u0, uv.v1, uv.u1, uv.v1], qi * 8);
      color.set(quad.color);
      for (let k = 0; k < 4; k += 1) colors.set([color.r, color.g, color.b], base + k * 3);
      const v = qi * 4;
      indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  // =========================================================================
  // 静态地图（SetMap，一次）
  // =========================================================================

  function ClearGroup(group, pool) {
    for (const child of [...group.children]) group.remove(child);
    for (const item of pool) {
      if (item.geometry) item.geometry.dispose();
      if (item.dispose) item.dispose();
    }
    pool.length = 0;
  }

  function SetMap(vm) {
    ClearGroup(gSurface, mapDisposables);
    ClearGroup(gRoof, []);
    viewState.heights.clear();
    const keys = Object.keys(vm.hexes ?? {});
    viewState.hexKeys = keys;
    if (!keys.length) return;

    // 包围盒（相机夹取）
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const key of keys) {
      const { q, r } = ParseHexKey(key);
      const world = HexToWorld(q, r);
      minX = Math.min(minX, world.x); maxX = Math.max(maxX, world.x);
      minZ = Math.min(minZ, world.z); maxZ = Math.max(maxZ, world.z);
    }
    camState.bounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };
    camState.target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);

    // 地块实例
    const hexMesh = new THREE.InstancedMesh(hexPrism, matHex, keys.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    keys.forEach((key, index) => {
      const hex = vm.hexes[key];
      const terrain = TerrainOf(hex);
      const { q, r } = ParseHexKey(key);
      const world = HexToWorld(q, r);
      viewState.heights.set(key, terrain.height);
      matrix.makeScale(1, terrain.height, 1);
      matrix.setPosition(world.x, 0, world.z);
      hexMesh.setMatrixAt(index, matrix);
      color.set(terrain.color);
      hexMesh.setColorAt(index, color);
    });
    hexMesh.instanceMatrix.needsUpdate = true;
    if (hexMesh.instanceColor) hexMesh.instanceColor.needsUpdate = true;
    gSurface.add(hexMesh);
    mapDisposables.push({ dispose: () => hexMesh.dispose() });

    // 网格线 + 屋顶线框（同几何双材质）
    const linePositions = [];
    for (const key of keys) linePositions.push(...HexOutlinePositions(key, TopY(key) + 0.015));
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const gridLines = new THREE.LineSegments(lineGeom, matGrid);
    gSurface.add(gridLines);
    const roofLines = new THREE.LineSegments(lineGeom, matRoof);
    roofLines.renderOrder = 5;
    gRoof.add(roofLines);
    mapDisposables.push({ geometry: lineGeom });

    // 道路条带 + 桥
    const roadPositions = [];
    const PushRibbon = (ax, ay, az, bx, by, bz, width) => {
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * width, pz = (dx / len) * width;
      roadPositions.push(
        ax - px, ay, az - pz, bx - px, by, bz - pz, ax + px, ay, az + pz,
        ax + px, ay, az + pz, bx - px, by, bz - pz, bx + px, by, bz + pz);
    };
    for (const key of keys) {
      const hex = vm.hexes[key];
      if (!hex.road) continue;
      const { q, r } = ParseHexKey(key);
      const here = HexToWorld(q, r);
      const hereY = TopY(key) + 0.03;
      for (const nKey of NeighborKeysOf(key)) {
        const neighbor = vm.hexes[nKey];
        if (!neighbor || !neighbor.road) continue;
        const there = HexToWorld(ParseHexKey(nKey).q, ParseHexKey(nKey).r);
        // 两半条带在边中点以两格平均高度相接，避免高差台阶
        const midY = (TopY(key) + TopY(nKey)) / 2 + 0.03;
        PushRibbon(here.x, hereY, here.z, (here.x + there.x) / 2, midY, (here.z + there.z) / 2, 0.14);
      }
    }
    if (roadPositions.length) {
      const roadGeom = new THREE.BufferGeometry();
      roadGeom.setAttribute("position", new THREE.Float32BufferAttribute(roadPositions, 3));
      roadGeom.computeVertexNormals();
      gSurface.add(new THREE.Mesh(roadGeom, matRoad));
      mapDisposables.push({ geometry: roadGeom });
    }

    // 白盒道具（村舍/树/坟/庄稼/桥）：顶点色合批进单几何
    BuildProps(vm, keys);
  }

  function NeighborKeysOf(key) {
    const { q, r } = ParseHexKey(key);
    return [
      HexKey(q + 1, r), HexKey(q + 1, r - 1), HexKey(q, r - 1),
      HexKey(q - 1, r), HexKey(q - 1, r + 1), HexKey(q, r + 1),
    ];
  }

  function BuildProps(vm, keys) {
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cone = new THREE.ConeGeometry(0.5, 1, 6);
    const boxPos = box.getAttribute("position");
    const conePos = cone.getAttribute("position");
    const boxIndex = box.getIndex().array;
    const coneIndex = cone.getIndex ? cone.getIndex()?.array : null;
    const PushGeom = (source, sourceIndex, cssColor, sx, sy, sz, tx, ty, tz) => {
      color.set(cssColor);
      const AddVertex = (vi) => {
        positions.push(source.getX(vi) * sx + tx, source.getY(vi) * sy + ty, source.getZ(vi) * sz + tz);
        colors.push(color.r, color.g, color.b);
      };
      if (sourceIndex) for (const vi of sourceIndex) AddVertex(vi);
      else for (let vi = 0; vi < source.count; vi += 1) AddVertex(vi);
    };
    const props = theme.surface.props;
    for (const key of keys) {
      const hex = vm.hexes[key];
      const { q, r } = ParseHexKey(key);
      const world = HexToWorld(q, r);
      const top = TopY(key);
      const jitter = ((q * 7 + r * 13) % 5) / 10 - 0.2;
      if (hex.terrain === "village") {
        PushGeom(boxPos, boxIndex, props.house.color, 0.42, 0.3, 0.34, world.x - 0.3, top + 0.15, world.z + 0.28 + jitter * 0.3);
        PushGeom(conePos, coneIndex, props.house.roof, 0.62, 0.24, 0.52, world.x - 0.3, top + 0.42, world.z + 0.28 + jitter * 0.3);
        PushGeom(boxPos, boxIndex, props.house.color, 0.34, 0.26, 0.3, world.x + 0.38, top + 0.13, world.z + 0.12 - jitter * 0.3);
        PushGeom(conePos, coneIndex, props.house.roof, 0.5, 0.2, 0.44, world.x + 0.38, top + 0.36, world.z + 0.12 - jitter * 0.3);
        const village = vm.villages?.[hex.villageId];
        if (village?.hasHq && village.hexKeys?.[0] === key) {
          PushGeom(boxPos, boxIndex, props.hqBanner.color, 0.05, 0.7, 0.05, world.x + 0.05, top + 0.35, world.z - 0.3);
          PushGeom(boxPos, boxIndex, props.hqBanner.color, 0.3, 0.18, 0.02, world.x + 0.2, top + 0.62, world.z - 0.3);
        }
      } else if (hex.terrain === "woods") {
        for (const [dx, dz, s] of [[-0.34, 0.22, 0.5], [0.3, 0.34, 0.42], [0.05, -0.3, 0.56]]) {
          PushGeom(boxPos, boxIndex, props.tree.trunk, 0.08, 0.24, 0.08, world.x + dx, top + 0.12, world.z + dz);
          PushGeom(conePos, coneIndex, props.tree.color, s, 0.66, s, world.x + dx, top + 0.5, world.z + dz);
        }
      } else if (hex.terrain === "grave") {
        for (const [dx, dz] of [[-0.26, 0.18], [0.24, -0.14], [0.02, 0.4]]) {
          PushGeom(conePos, coneIndex, props.grave.color, 0.3, 0.22, 0.3, world.x + dx, top + 0.11, world.z + dz);
        }
      } else if (hex.terrain === "field") {
        for (const row of [-0.3, 0.05, 0.4]) {
          PushGeom(boxPos, boxIndex, props.crop.color, 1.1, 0.14, 0.12, world.x, top + 0.07, world.z + row + jitter * 0.2);
        }
      } else if (hex.bridge) {
        PushGeom(boxPos, boxIndex, theme.surface.bridge, 1.5, 0.1, 0.5, world.x, top + 0.16, world.z);
      }
    }
    box.dispose();
    cone.dispose();
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    gSurface.add(new THREE.Mesh(geometry, matProps));
    mapDisposables.push({ geometry });
  }

  // =========================================================================
  // 动态视图（SetView，状态变化时）
  // =========================================================================

  function SetView(vm) {
    viewState.vm = vm;
    for (const group of [gUnder, gAlways, gBadgeSurface, gBadgeUnder, gIntent]) {
      for (const child of [...group.children]) group.remove(child);
    }
    for (const item of disposables) {
      if (item.geometry) item.geometry.dispose();
      if (item.dispose) item.dispose();
    }
    disposables.length = 0;
    BuildUnderNetwork(vm);
    BuildAlwaysMarks(vm);
    BuildBadges(vm);
    BuildIntents(vm);
    SyncUnits(vm);
    SyncGhosts(vm);
    ApplyLayerTargets();
  }

  function BuildUnderNetwork(vm) {
    const tunnels = vm.tunnels ?? {};
    const cells = tunnels.cells ?? {};
    const cellKeys = Object.keys(cells);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    // 地道格衬板 + 描边
    if (cellKeys.length) {
      const padMesh = new THREE.InstancedMesh(hexTile, matPad, cellKeys.length);
      const edgePositions = [];
      cellKeys.forEach((key, index) => {
        const { q, r } = ParseHexKey(key);
        const world = HexToWorld(q, r);
        matrix.makeTranslation(world.x, underY, world.z);
        padMesh.setMatrixAt(index, matrix);
        edgePositions.push(...HexOutlinePositions(key, underY + 0.01, 0.92));
      });
      padMesh.instanceMatrix.needsUpdate = true;
      padMesh.renderOrder = 4;
      gUnder.add(padMesh);
      disposables.push({ dispose: () => padMesh.dispose() });
      const edgeGeom = new THREE.BufferGeometry();
      edgeGeom.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
      const padEdges = new THREE.LineSegments(edgeGeom, matPadEdge);
      padEdges.renderOrder = 4;
      gUnder.add(padEdges);
      disposables.push({ geometry: edgeGeom });
    }

    // 段 = 发光管线（地下态）+ 拓扑线（地上态 15%）
    const edges = tunnels.edges ?? {};
    const edgeKeys = Object.keys(edges);
    if (edgeKeys.length) {
      const tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.16), matTube, edgeKeys.length);
      const topoPositions = [];
      const up = new THREE.Vector3(0, 1, 0);
      edgeKeys.forEach((edgeKey, index) => {
        const [aKey, bKey] = EdgeKeyPair(edgeKey);
        const a = HexToWorld(ParseHexKey(aKey).q, ParseHexKey(aKey).r);
        const b = HexToWorld(ParseHexKey(bKey).q, ParseHexKey(bKey).r);
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
        matrix.makeRotationY(angle);
        matrix.scale(new THREE.Vector3(length, 1, 1));
        matrix.setPosition((a.x + b.x) / 2, underY + 0.12, (a.z + b.z) / 2);
        tubeMesh.setMatrixAt(index, matrix);
        topoPositions.push(a.x, underY + 0.12, a.z, b.x, underY + 0.12, b.z);
      });
      tubeMesh.instanceMatrix.needsUpdate = true;
      tubeMesh.renderOrder = 5;
      gUnder.add(tubeMesh);
      disposables.push({ dispose: () => { tubeMesh.geometry.dispose(); tubeMesh.dispose(); } });
      const topoGeom = new THREE.BufferGeometry();
      topoGeom.setAttribute("position", new THREE.Float32BufferAttribute(topoPositions, 3));
      const topoLines = new THREE.LineSegments(topoGeom, matTopo);
      topoLines.renderOrder = 5;
      gUnder.add(topoLines);
      disposables.push({ geometry: topoGeom });

      // 隔断门
      const doorEntries = edgeKeys.filter((edgeKey) => edges[edgeKey]?.door);
      if (doorEntries.length) {
        const doorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.34, 0.42), matDoor, doorEntries.length);
        doorEntries.forEach((edgeKey, index) => {
          const [aKey, bKey] = EdgeKeyPair(edgeKey);
          const a = HexToWorld(ParseHexKey(aKey).q, ParseHexKey(aKey).r);
          const b = HexToWorld(ParseHexKey(bKey).q, ParseHexKey(bKey).r);
          const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
          const open = edges[edgeKey].door === "open";
          matrix.makeRotationY(angle + (open ? Math.PI / 3 : 0));
          matrix.setPosition((a.x + b.x) / 2, underY + 0.22, (a.z + b.z) / 2);
          doorMesh.setMatrixAt(index, matrix);
          color.set(open ? theme.under.doorOpen : theme.under.doorClosed);
          doorMesh.setColorAt(index, color);
        });
        doorMesh.instanceMatrix.needsUpdate = true;
        if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true;
        doorMesh.renderOrder = 6;
        gUnder.add(doorMesh);
        disposables.push({ dispose: () => { doorMesh.geometry.dispose(); doorMesh.dispose(); } });
      }
    }

    // 设施小立方体
    const facilityEntries = cellKeys.filter((key) => cells[key]?.facility);
    if (facilityEntries.length) {
      const facMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), matFacility, facilityEntries.length);
      facilityEntries.forEach((key, index) => {
        const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
        matrix.makeTranslation(world.x, underY + 0.28, world.z + 0.34);
        facMesh.setMatrixAt(index, matrix);
        const facility = theme.under.facilities[cells[key].facility] ?? theme.under.facilities.storage;
        color.set(facility.color);
        facMesh.setColorAt(index, color);
      });
      facMesh.instanceMatrix.needsUpdate = true;
      if (facMesh.instanceColor) facMesh.instanceColor.needsUpdate = true;
      facMesh.renderOrder = 6;
      gUnder.add(facMesh);
      disposables.push({ dispose: () => { facMesh.geometry.dispose(); facMesh.dispose(); } });
    }

    // 烟：地道格覆膜
    const smokeKeys = cellKeys.filter((key) => (cells[key]?.smoke ?? 0) > 0);
    if (smokeKeys.length) {
      const smokeMesh = new THREE.InstancedMesh(hexTile, matSmoke, smokeKeys.length);
      smokeKeys.forEach((key, index) => {
        const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
        matrix.makeTranslation(world.x, underY + 0.3, world.z);
        smokeMesh.setMatrixAt(index, matrix);
      });
      smokeMesh.instanceMatrix.needsUpdate = true;
      smokeMesh.renderOrder = 7;
      gUnder.add(smokeMesh);
      disposables.push({ dispose: () => smokeMesh.dispose() });
    }

    // 入口竖井指示线（地下层的一部分）
    const entrances = tunnels.entrances ?? {};
    const shaftPositions = [];
    for (const key of Object.keys(entrances)) {
      const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
      shaftPositions.push(world.x, TopY(key), world.z, world.x, underY + 0.1, world.z);
    }
    if (shaftPositions.length) {
      const shaftGeom = new THREE.BufferGeometry();
      shaftGeom.setAttribute("position", new THREE.Float32BufferAttribute(shaftPositions, 3));
      const shaftLines = new THREE.LineSegments(shaftGeom, matShaft);
      shaftLines.renderOrder = 5;
      gUnder.add(shaftLines);
      disposables.push({ geometry: shaftGeom });
    }
  }

  /** 入口色环（双层）与通风白杆：两层常显。 */
  function BuildAlwaysMarks(vm) {
    const tunnels = vm.tunnels ?? {};
    const entrances = tunnels.entrances ?? {};
    const vents = tunnels.vents ?? {};
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const entranceKeys = Object.keys(entrances);
    if (entranceKeys.length) {
      // 地表环常显；地下环单独一组，透明度随地下亮度（避免地上态出现幽灵双环）
      const surfaceRings = new THREE.InstancedMesh(ringGeom, matRing, entranceKeys.length);
      const underRings = new THREE.InstancedMesh(ringGeom, matRingUnder, entranceKeys.length);
      entranceKeys.forEach((key, index) => {
        const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
        color.set(EntranceTierColor(EntranceTier(entrances[key])));
        matrix.makeTranslation(world.x, TopY(key) + 0.05, world.z);
        surfaceRings.setMatrixAt(index, matrix);
        surfaceRings.setColorAt(index, color);
        matrix.makeTranslation(world.x, underY + 0.1, world.z);
        underRings.setMatrixAt(index, matrix);
        underRings.setColorAt(index, color);
      });
      for (const mesh of [surfaceRings, underRings]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.renderOrder = 9;
        gAlways.add(mesh);
        disposables.push({ dispose: () => mesh.dispose() });   // 共享 ringGeom 不 dispose
      }
    }
    const ventKeys = Object.keys(vents);
    if (ventKeys.length) {
      // 白色竖杆拆成两截短桩：地表桩常显、地下桩随地下亮度（整根贯穿会像一道贯屏光柱）
      const poleGeom = new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6);
      const surfacePoles = new THREE.InstancedMesh(poleGeom, matVent, ventKeys.length);
      const underPoles = new THREE.InstancedMesh(poleGeom, matVentUnder, ventKeys.length);
      disposables.push({ geometry: poleGeom, dispose: () => { surfacePoles.dispose(); underPoles.dispose(); } });
      ventKeys.forEach((key, index) => {
        const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
        matrix.makeTranslation(world.x + 0.5, TopY(key) + 0.28, world.z + 0.4);
        surfacePoles.setMatrixAt(index, matrix);
        matrix.makeTranslation(world.x + 0.5, underY + 0.28, world.z + 0.4);
        underPoles.setMatrixAt(index, matrix);
      });
      surfacePoles.instanceMatrix.needsUpdate = true;
      underPoles.instanceMatrix.needsUpdate = true;
      surfacePoles.renderOrder = 9;
      underPoles.renderOrder = 6;
      gAlways.add(surfacePoles);
      gAlways.add(underPoles);
    }
  }

  // ---------------- 徽记（每格 ≤3，数字不上格） ----------------

  function BuildBadges(vm) {
    const surfaceQuads = [];
    const underQuads = [];
    const tunnels = vm.tunnels ?? {};
    const entrances = tunnels.entrances ?? {};
    const vents = tunnels.vents ?? {};
    const cells = tunnels.cells ?? {};
    const digs = tunnels.digs ?? {};

    const PushBeadRow = (quads, key, y, slot, expose, threshold) => {
      const shown = Math.max(1, Math.min(threshold, 9));
      const size = Math.min(0.17, 1.35 / shown);
      const startX = -((shown - 1) * size * 1.05) / 2;
      const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
      for (let i = 0; i < shown; i += 1) {
        const filled = i < Math.min(expose, threshold);
        quads.push({
          x: world.x + slot.x + startX + i * size * 1.05, y, z: world.z + slot.z,
          size, glyph: filled ? "beadFilled" : "beadHollow",
          color: filled ? theme.badges.beadFilled : theme.badges.beadHollow,
        });
      }
    };
    const PushDotRow = (quads, key, y, slot, count) => {
      const shown = Math.min(count, 6);
      const size = 0.13;
      const startX = -((shown - 1) * size * 1.2) / 2;
      const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
      for (let i = 0; i < shown; i += 1) {
        quads.push({ x: world.x + slot.x + startX + i * size * 1.2, y, z: world.z + slot.z,
          size, glyph: "dot", color: theme.badges.traceDot });
      }
    };
    const PushGlyph = (quads, key, y, slot, glyph, cssColor, size = 0.3) => {
      const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
      quads.push({ x: world.x + slot.x, y, z: world.z + slot.z, size, glyph, color: cssColor });
    };

    // —— 地表徽记：优先级 部 > 暴露豆 > 痕迹 > 断路 > 搜/袭 ——（预算 3）
    // 「部」排第一：L2 的即败条件绑定区队部，这枚地标不能被别的徽记挤掉。
    for (const [key, hex] of Object.entries(vm.hexes ?? {})) {
      const y = TopY(key) + 0.1;
      const rows = [];
      const entrance = entrances[key];
      const vent = vents[key];
      const village = vm.villages?.[hex.villageId];
      if (village?.hasHq && village.hexKeys?.[0] === key) {
        rows.push((slot) => PushGlyph(surfaceQuads, key, y, slot, "部", theme.badges.hq, 0.34));
      }
      if (entrance && !entrance.sealed) {
        rows.push((slot) => PushBeadRow(surfaceQuads, key, y, slot, entrance.expose ?? 0, Math.max(1, (entrance.conceal ?? 2) * 3)));
      } else if (vent) {
        rows.push((slot) => PushBeadRow(surfaceQuads, key, y, slot, vent.expose ?? 0, 6));
      }
      if ((hex.traces ?? 0) > 0) rows.push((slot) => PushDotRow(surfaceQuads, key, y, slot, hex.traces));
      if (hex.roadBroken) rows.push((slot) => PushGlyph(surfaceQuads, key, y, slot, "cross", theme.surface.roadBroken));
      if (hex.searched) rows.push((slot) => PushGlyph(surfaceQuads, key, y, slot, "搜", theme.badges.searched, 0.26));
      if (hex.attackSite) rows.push((slot) => PushGlyph(surfaceQuads, key, y, slot, "袭", theme.badges.attackSite, 0.26));
      rows.slice(0, 3).forEach((build, index) => build(badgeSlots[index]));
      if (vent?.smoked) PushGlyph(surfaceQuads, key, TopY(key) + 0.9, { x: 0.5, z: 0.4 }, "puff", theme.badges.smoke, 0.3);
    }

    // —— 地下徽记：设施字符 + 挖掘进度环 + 烟 ——
    for (const [key, cell] of Object.entries(cells)) {
      const y = underY + 0.5;
      if (cell.facility) {
        const facility = theme.under.facilities[cell.facility];
        if (facility) PushGlyph(underQuads, key, y + 0.24, { x: 0, z: 0.34 }, facility.label, facility.color, 0.42);
      }
      if ((cell.smoke ?? 0) > 0) PushGlyph(underQuads, key, y + 0.1, { x: -0.4, z: -0.3 }, "puff", theme.badges.smoke, 0.34);
    }
    for (const dig of Object.values(digs)) {
      const pct = (dig.progress ?? 0) / Math.max(1, dig.need ?? 1);
      const glyph = pct >= 0.5 ? "ring50" : "ring0";
      if (dig.kind === "road") {
        if (dig.at) PushGlyph(surfaceQuads, dig.at, TopY(dig.at) + 0.1, badgeSlots[2], glyph, theme.badges.digRing, 0.3);
      } else if (dig.edge) {
        const [aKey, bKey] = EdgeKeyPair(dig.edge);
        const a = HexToWorld(ParseHexKey(aKey).q, ParseHexKey(aKey).r);
        const b = HexToWorld(ParseHexKey(bKey).q, ParseHexKey(bKey).r);
        underQuads.push({ x: (a.x + b.x) / 2, y: underY + 0.45, z: (a.z + b.z) / 2,
          size: 0.34, glyph, color: theme.badges.digRing });
      } else if (dig.at) {
        PushGlyph(underQuads, dig.at, underY + 0.55, { x: -0.34, z: 0.3 }, glyph, theme.badges.digRing, 0.3);
      }
    }

    if (surfaceQuads.length) {
      const mesh = BuildBadgeMesh(surfaceQuads, matBadgeSurface);
      mesh.renderOrder = 6;
      gBadgeSurface.add(mesh);
      disposables.push({ geometry: mesh.geometry });
    }
    if (underQuads.length) {
      const mesh = BuildBadgeMesh(underQuads, matBadgeUnder);
      mesh.renderOrder = 7;
      gBadgeUnder.add(mesh);
      disposables.push({ geometry: mesh.geometry });
    }
  }

  // ---------------- 敌纵队意图箭头 ----------------

  function BuildIntents(vm) {
    const intents = vm.intents ?? [];
    const headGeom = new THREE.ConeGeometry(0.14, 0.3, 4);
    headGeom.rotateX(Math.PI / 2);
    disposables.push({ geometry: headGeom });
    const questionQuads = [];
    for (const intent of intents) {
      if (intent.question) {
        const world = HexToWorld(ParseHexKey(intent.pos).q, ParseHexKey(intent.pos).r);
        questionQuads.push({ x: world.x + 0.45, y: TopY(intent.pos) + 0.95, z: world.z - 0.4,
          size: 0.38, glyph: "question", color: theme.badges.intentUnknown });
        continue;
      }
      const points = [intent.pos, ...(intent.path ?? [])];
      if (points.length < 2) continue;
      const positions = [];
      for (const key of points) {
        const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
        positions.push(new THREE.Vector3(world.x, TopY(key) + 0.14, world.z));
      }
      const lineGeom = new THREE.BufferGeometry().setFromPoints(positions);
      disposables.push({ geometry: lineGeom });
      const line = new THREE.Line(lineGeom, matIntent);
      line.computeLineDistances();
      line.renderOrder = 3;
      gIntent.add(line);
      const last = positions[positions.length - 1];
      const previous = positions[positions.length - 2];
      const head = new THREE.Mesh(headGeom, matIntentHead);
      head.position.copy(last);
      head.lookAt(last.clone().add(last.clone().sub(previous)));
      head.renderOrder = 3;
      gIntent.add(head);
    }
    if (questionQuads.length) {
      const mesh = BuildBadgeMesh(questionQuads, matBadgeSurface);
      mesh.renderOrder = 6;
      gIntent.add(mesh);
      disposables.push({ geometry: mesh.geometry });
    }
  }

  // ---------------- 单位 ----------------

  function CreateLabelTexture(label, cssColor) {
    const size = 96;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = size;
    canvasEl.height = size;
    const ctx = canvasEl.getContext("2d");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = cssColor;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = theme.units.labelStroke;
    ctx.stroke();
    ctx.font = "bold 52px 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.units.labelText;
    ctx.fillText(label, size / 2, size / 2 + 3);
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const labelTextureCache = new Map();
  function LabelTexture(label, cssColor) {
    const cacheKey = `${label}|${cssColor}`;
    if (!labelTextureCache.has(cacheKey)) labelTextureCache.set(cacheKey, CreateLabelTexture(label, cssColor));
    return labelTextureCache.get(cacheKey);
  }

  function UnitStyleOf(unit) {
    const style = theme.units[unit.type] ?? theme.units.militia;
    if (unit.type === "spy" && !unit.revealed) {
      return { ...style, color: style.civilianColor, label: style.civilianLabel };
    }
    return style;
  }

  function CreateUnitMesh(unit) {
    const style = UnitStyleOf(unit);
    const root = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.color), transparent: true });
    let body;
    if (style.shape === "coneBox") {
      body = new THREE.Group();
      const coneMesh = new THREE.Mesh(unitGeoms.cone, material);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.16), material);
      pack.position.set(0, -0.1, -0.26);
      body.add(coneMesh, pack);
    } else {
      body = new THREE.Mesh(unitGeoms[style.shape] ?? unitGeoms.box, material);
    }
    body.position.y = shapeLift[style.shape] ?? 0.3;
    body.traverse?.((node) => { node.userData.unitId = unit.id; });
    body.userData.unitId = unit.id;
    root.add(body);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: LabelTexture(style.label, style.color), transparent: true, depthTest: false }));
    sprite.scale.setScalar(0.42);
    sprite.position.y = 1.05;
    sprite.renderOrder = 11;
    sprite.userData.unitId = unit.id;
    root.add(sprite);
    const ambushRing = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.badges.ambush), transparent: true, opacity: 0.95, depthTest: false }));
    ambushRing.scale.setScalar(0.8);
    ambushRing.position.y = 0.08;
    ambushRing.renderOrder = 11;
    ambushRing.visible = false;
    root.add(ambushRing);
    return { root, body, material, sprite, ambushRing, styleKey: `${style.shape}|${style.color}|${style.label}` };
  }

  function UnitWorldPos(unit) {
    const world = HexToWorld(ParseHexKey(unit.pos).q, ParseHexKey(unit.pos).r);
    const y = unit.layer === "under" ? underY + 0.1 : TopY(unit.pos);
    return new THREE.Vector3(world.x, y, world.z);
  }

  function SyncUnits(vm) {
    const seen = new Set();
    for (const unit of vm.units ?? []) {
      seen.add(unit.id);
      let visual = viewState.unitVisuals.get(unit.id);
      const style = UnitStyleOf(unit);
      const styleKey = `${style.shape}|${style.color}|${style.label}`;
      if (visual && visual.styleKey !== styleKey) {           // 特务现形等：重建
        visual.root.parent?.remove(visual.root);
        visual.material.dispose();
        viewState.unitVisuals.delete(unit.id);
        visual = null;
      }
      if (!visual) {
        visual = CreateUnitMesh(unit);
        visual.tween = null;
        viewState.unitVisuals.set(unit.id, visual);
        visual.root.position.copy(UnitWorldPos(unit));
      }
      const parent = unit.layer === "under" ? gUnitUnder : gUnitSurface;
      if (visual.root.parent !== parent) {
        visual.root.parent?.remove(visual.root);
        parent.add(visual.root);
      }
      const targetPos = UnitWorldPos(unit);
      if (visual.root.position.distanceToSquared(targetPos) > 1e-6) {
        visual.tween = { from: visual.root.position.clone(), to: targetPos, t: 0, duration: 220 };
      }
      // 状态呈现：已行动压暗 / 隐蔽半透明 / 伏击紫环
      const baseColor = new THREE.Color(style.color);
      if (unit.acted) baseColor.multiplyScalar(theme.units.actedShade);
      visual.material.color.copy(baseColor);
      visual.baseOpacity = unit.stance === "hidden" ? theme.units.hiddenOpacity : 1;
      visual.ambushRing.visible = unit.stance === "ambush";
      visual.layer = unit.layer;
      visual.unit = unit;
    }
    for (const [unitId, visual] of [...viewState.unitVisuals]) {
      if (!seen.has(unitId)) {
        visual.root.parent?.remove(visual.root);
        visual.material.dispose();
        viewState.unitVisuals.delete(unitId);
      }
    }
  }

  function SyncGhosts(vm) {
    for (const mesh of viewState.ghostMeshes) {
      mesh.parent?.remove(mesh);
      mesh.material.dispose();
    }
    viewState.ghostMeshes = [];
    for (const ghost of vm.ghosts ?? []) {
      const style = theme.units[ghost.type] ?? theme.units.inf;
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.units.ghost), transparent: true, opacity: 0.35, depthTest: false });
      const mesh = new THREE.Mesh(unitGeoms[style.shape === "coneBox" ? "cone" : style.shape] ?? unitGeoms.cone, material);
      const world = HexToWorld(ParseHexKey(ghost.pos).q, ParseHexKey(ghost.pos).r);
      mesh.position.set(world.x, TopY(ghost.pos) + (shapeLift[style.shape] ?? 0.3), world.z);
      mesh.renderOrder = 6;
      gUnitSurface.add(mesh);
      viewState.ghostMeshes.push(mesh);
    }
  }

  // ---------------- 高亮 / 路径 / 悬停 / 选中 ----------------
  //
  // 可达提示（文明VI 手感）：覆膜 + 六边形描边，两档
  //   free  = 走到该格仍有剩余 MP（亮青 + 青白粗描边）
  //   spent = 走到该格正好走满 MP（钢青 + 蓝灰描边，明显压一档）
  //   target= 目标模式（挖掘等）的候选格，换琥珀色另一套语言
  // 实现：两张 InstancedMesh（覆膜/描边）一次分配、反复复用，只改 count 与 instanceColor，
  // 不在 SetReachable 里新建几何体，更不在 Frame 里建。

  const reachTierColor = Object.freeze({
    free: Object.freeze({ fill: theme.highlight.reachable, edge: theme.highlight.reachableEdge }),
    spent: Object.freeze({ fill: theme.highlight.reachableSpent, edge: theme.highlight.reachableSpentEdge }),
    target: Object.freeze({ fill: theme.highlight.target, edge: theme.highlight.targetEdge }),
  });

  const reach = { fill: null, edge: null, capacity: 0, count: 0, keys: [], farthest: null, layer: "surface" };
  let overlayLayer = "surface";     // 可达/路径归属层：Frame 里据此让高亮跟随该层明暗
  let hoverRing = null;
  let selectRing = null;

  function EnsureReachCapacity(needed) {
    if (reach.capacity >= needed && reach.fill) return;
    const capacity = Math.max(64, needed, reach.capacity * 2);
    for (const mesh of [reach.fill, reach.edge]) {
      if (!mesh) continue;
      gOverlay.remove(mesh);
      mesh.dispose();
    }
    reach.fill = new THREE.InstancedMesh(hexTile, matReachFill, capacity);
    reach.edge = new THREE.InstancedMesh(hexRingReach, matReachEdge, capacity);
    for (const mesh of [reach.fill, reach.edge]) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.frustumCulled = false;
      mesh.count = 0;
      gOverlay.add(mesh);
    }
    reach.fill.renderOrder = 10;
    reach.edge.renderOrder = 11;
    reach.capacity = capacity;
  }

  /** entries：`[hexKey]`（默认 free 档）或 `[{key, tier}]`。tier ∈ free|spent|target。 */
  function SetReachable(entries, layer) {
    const list = (entries ?? []).map((entry) => (typeof entry === "string" ? { key: entry, tier: "free" } : entry))
      .filter((entry) => entry && entry.key);
    reach.keys = list.map((entry) => entry.key);
    reach.layer = layer ?? viewState.layer;
    if (list.length) overlayLayer = reach.layer;
    reach.farthest = list.reduce((best, entry) =>
      ((entry.steps ?? 0) > (best?.steps ?? -1) ? entry : best), null)?.key ?? reach.keys[reach.keys.length - 1] ?? null;
    viewState.reachable = list;
    if (!list.length) {
      reach.count = 0;
      if (reach.fill) { reach.fill.count = 0; reach.edge.count = 0; }
      return;
    }
    EnsureReachCapacity(list.length);
    // 地上态：覆膜吃深度测试，站在可达格上的单位不会被青色洗掉；
    // 地下态：必须透地画，才看得见埋在地表下的地道格。描边一律不吃深度，保证轮廓永不断。
    matReachFill.depthTest = reach.layer !== "under";
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    list.forEach((entry, index) => {
      const world = HexToWorld(ParseHexKey(entry.key).q, ParseHexKey(entry.key).r);
      const y = LayerY(entry.key, reach.layer);
      matrix.makeTranslation(world.x, y + 0.02, world.z);
      reach.fill.setMatrixAt(index, matrix);
      matrix.makeTranslation(world.x, y + 0.035, world.z);
      reach.edge.setMatrixAt(index, matrix);
      const tier = reachTierColor[entry.tier] ?? reachTierColor.free;
      color.set(tier.fill);
      reach.fill.instanceColor.setXYZ(index, color.r, color.g, color.b);
      color.set(tier.edge);
      reach.edge.instanceColor.setXYZ(index, color.r, color.g, color.b);
    });
    reach.count = list.length;
    reach.fill.count = list.length;
    reach.edge.count = list.length;
    reach.fill.instanceMatrix.needsUpdate = true;
    reach.edge.instanceMatrix.needsUpdate = true;
    reach.fill.instanceColor.needsUpdate = true;
    reach.edge.instanceColor.needsUpdate = true;
  }

  // ---------------- 路径预览（管线 + 方向箭头 + 落点环 + 代价牌） ----------------
  //
  // 1px 的 THREE.Line 在 WebGL 下永远看不清 → 改 TubeGeometry 实体管线；
  // 段中点摆箭头给方向；终点套「落点环 + 六边形轮廓」；代价用广告牌小牌子写在落点上方。
  // 全部只在「路径变了」时重建（悬停格不变就不动），Frame 里只做脉冲，不建几何体。

  const pathGroup = new THREE.Group();
  pathGroup.renderOrder = 12;
  gOverlay.add(pathGroup);
  const pathTubes = [];              // [{mesh}] 动态几何，路径变更时重建
  const pathArrows = [];             // 复用的箭头 Mesh 池
  const pathJoints = [];             // 复用的转角球 Mesh 池
  let destRing = null;
  let destOutline = null;
  let costMesh = null;
  let pathSignature = "";
  const pathState = { active: false, keys: [], risk: false };

  function ClearPathTubes() {
    for (const mesh of pathTubes) { pathGroup.remove(mesh); mesh.geometry.dispose(); }
    pathTubes.length = 0;
  }

  function PathPoints(keys, layer) {
    return keys.map((key) => {
      const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
      return new THREE.Vector3(world.x, LayerY(key, layer) + 0.16, world.z);
    });
  }

  function MakeTube(points, material) {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.25);
    const segments = Math.max(8, (points.length - 1) * 8);
    const geometry = new THREE.TubeGeometry(curve, segments, theme.highlight.pathRadius, 6, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 12;
    mesh.frustumCulled = false;
    pathGroup.add(mesh);
    pathTubes.push(mesh);
  }

  function PoolMesh(pool, geometry, material) {
    const existing = pool.find((mesh) => !mesh.visible);
    if (existing) { existing.visible = true; return existing; }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 13;
    mesh.frustumCulled = false;
    pathGroup.add(mesh);
    pool.push(mesh);
    return mesh;
  }

  /** preview: { path:[key], layer, riskFrom, steps, mpLeft, costText } —— 数据全部由 Script_Main 从引擎取。 */
  function SetPath(preview) {
    const keys = preview?.path ?? [];
    const layer = preview?.layer ?? "surface";
    const riskFrom = preview?.riskFrom ?? keys.length;
    const signature = `${keys.join(">")}|${layer}|${riskFrom}|${preview?.costText ?? ""}`;
    if (signature === pathSignature) return;
    pathSignature = signature;

    ClearPathTubes();
    for (const mesh of pathArrows) mesh.visible = false;
    for (const mesh of pathJoints) mesh.visible = false;
    if (destRing) destRing.visible = false;
    if (destOutline) destOutline.visible = false;
    if (costMesh) costMesh.visible = false;
    pathState.active = false;
    pathState.keys = [];
    pathState.risk = false;
    if (keys.length < 2) return;
    overlayLayer = layer;

    const points = PathPoints(keys, layer);
    const risky = riskFrom < keys.length - 1;
    pathState.active = true;
    pathState.keys = keys.slice();
    pathState.risk = risky;

    // 管线：安全段 + 风险段（风险段整段变橙，AGENTS §六.4）
    const safeCut = Math.min(points.length, riskFrom + 1);
    MakeTube(points.slice(0, safeCut), matPath);
    if (risky) MakeTube(points.slice(Math.max(0, riskFrom)), matPathRisk);

    // 转角球：把折线接缝填圆，读起来是一条连续的绳
    for (let i = 1; i < points.length - 1; i += 1) {
      const joint = PoolMesh(pathJoints, pathJointGeom, i >= riskFrom ? matPathRisk : matPath);
      joint.material = i >= riskFrom ? matPathRisk : matPath;
      joint.position.copy(points[i]);
    }
    // 方向箭头：每段中点一个，指向行进方向
    for (let i = 0; i < points.length - 1; i += 1) {
      const arrow = PoolMesh(pathArrows, pathArrowGeom, matPathArrow);
      arrow.position.lerpVectors(points[i], points[i + 1], 0.55);
      arrow.lookAt(points[i + 1]);
    }

    // 落点：六边形粗轮廓 + 环 + 代价牌
    const destKey = keys[keys.length - 1];
    const destWorld = HexToWorld(ParseHexKey(destKey).q, ParseHexKey(destKey).r);
    const destY = LayerY(destKey, layer);
    const destColor = risky ? theme.highlight.destRisk : theme.highlight.dest;
    matDest.color.set(destColor);
    matDestOutline.color.set(destColor);
    if (!destRing) {
      destRing = new THREE.Mesh(destRingGeom, matDest);
      destRing.renderOrder = 13;
      destRing.frustumCulled = false;
      pathGroup.add(destRing);
    }
    if (!destOutline) {
      destOutline = new THREE.Mesh(hexRingDest, matDestOutline);
      destOutline.renderOrder = 13;
      destOutline.frustumCulled = false;
      pathGroup.add(destOutline);
    }
    destRing.position.set(destWorld.x, destY + 0.1, destWorld.z);
    destRing.visible = true;
    destOutline.position.set(destWorld.x, destY + 0.05, destWorld.z);
    destOutline.visible = true;

    if (preview?.costText) {
      if (!costMesh) {
        costMesh = new THREE.Mesh(costPlaneGeom, matCost);
        costMesh.renderOrder = 14;
        costMesh.frustumCulled = false;
        costMesh.rotation.x = -cameraPitchRad;   // 固定俯角相机 → 广告牌姿态可静态求解
        pathGroup.add(costMesh);
      }
      const plate = CostTexture(preview.costText, risky ? theme.highlight.destRisk : theme.highlight.dest);
      costMesh.material.map = plate.texture;
      costMesh.material.needsUpdate = true;
      costMesh.userData.plate = plate;            // Frame 里按缩放档反向缩放 → 屏幕上大小恒定
      costMesh.position.set(destWorld.x, destY + 0.78, destWorld.z + 0.06);
      costMesh.visible = true;
    }
  }

  // 代价牌纹理（文字集合很小：「余 N MP」这类，缓存住不重复画）
  const costTextureCache = new Map();
  function CostTexture(text, borderColor) {
    const cacheKey = `${text}|${borderColor}`;
    if (costTextureCache.has(cacheKey)) return costTextureCache.get(cacheKey);
    const scale = 4;
    const fontPx = 30;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `700 ${fontPx}px 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif`;
    const textWidth = Math.ceil(probe.measureText(text).width);
    const padX = 20;
    const cssWidth = textWidth + padX * 2;
    const cssHeight = fontPx + 20;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = cssWidth * scale / 2;
    canvasEl.height = cssHeight * scale / 2;
    const ctx = canvasEl.getContext("2d");
    ctx.scale(scale / 2, scale / 2);
    const radius = 7;
    ctx.beginPath();
    ctx.moveTo(radius, 1);
    ctx.arcTo(cssWidth - 1, 1, cssWidth - 1, cssHeight - 1, radius);
    ctx.arcTo(cssWidth - 1, cssHeight - 1, 1, cssHeight - 1, radius);
    ctx.arcTo(1, cssHeight - 1, 1, 1, radius);
    ctx.arcTo(1, 1, cssWidth - 1, 1, radius);
    ctx.closePath();
    ctx.fillStyle = theme.highlight.costBg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.font = `700 ${fontPx}px 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.highlight.costText;
    ctx.fillText(text, cssWidth / 2, cssHeight / 2 + 1);
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    const worldHeight = 0.34;
    const entry = { texture, width: worldHeight * (cssWidth / cssHeight), height: worldHeight };
    costTextureCache.set(cacheKey, entry);
    return entry;
  }

  function SetHover(key, layer) {
    viewState.hoverKey = key;
    viewState.hoverLayer = layer ?? viewState.layer;
    if (!hoverRing) {
      hoverRing = new THREE.Mesh(hexRingHover, matHover);
      hoverRing.renderOrder = 12;
      hoverRing.frustumCulled = false;
      gOverlay.add(hoverRing);
    }
    if (!key) { hoverRing.visible = false; return; }
    const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
    hoverRing.position.set(world.x, LayerY(key, viewState.hoverLayer) + 0.05, world.z);
    hoverRing.visible = true;
  }

  function SetSelection(selection) {
    viewState.selection = selection;
    if (!selectRing) {
      selectRing = new THREE.Mesh(ringGeom, matSelect);
      selectRing.renderOrder = 11;
      gOverlay.add(selectRing);
    }
    if (!selection) { selectRing.visible = false; return; }
    const key = selection.hexKey ?? viewState.unitVisuals.get(selection.unitId)?.unit?.pos;
    if (!key) { selectRing.visible = false; return; }
    const layer = selection.layer ?? "surface";
    const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
    selectRing.position.set(world.x, LayerY(key, layer) + 0.06, world.z);
    selectRing.visible = true;
  }

  // ---------------- 层切换 / 窥视（§六.1/2） ----------------

  function ApplyLayerTargets() {
    const mix = theme.layerMix;
    const under = viewState.layer === "under";
    const peek = viewState.peek;
    const eff = viewState.eff;
    eff.surfaceOpacity.target = under ? (peek ? 0.75 : mix.surfaceOpacityUnder) : (peek ? mix.peekSurfaceOpacity : 1);
    eff.underBrightness.target = under ? 1 : (peek ? mix.peekUnderBrightness : mix.underBrightnessSurface);
    eff.surfaceUnitOpacity.target = under ? (peek ? 0.7 : mix.surfaceUnitsUnderOpacity) : (peek ? 0.6 : 1);
  }

  function SetLayer(layer) {
    if (layer !== "surface" && layer !== "under") return;
    viewState.layer = layer;
    ApplyLayerTargets();
    if (viewState.hoverKey) SetHover(viewState.hoverKey, layer);
  }

  function SetPeek(on) {
    viewState.peek = Boolean(on);
    ApplyLayerTargets();
  }

  function StepEff(slot, dt, duration) {
    const step = dt / Math.max(1, duration);
    if (slot.value < slot.target) slot.value = Math.min(slot.target, slot.value + step);
    else if (slot.value > slot.target) slot.value = Math.max(slot.target, slot.value - step);
  }

  function ApplyLayerFrame(dt) {
    const mix = theme.layerMix;
    const duration = viewState.peek ? mix.peekMs : mix.switchMs;
    const eff = viewState.eff;
    StepEff(eff.surfaceOpacity, dt, duration);
    StepEff(eff.underBrightness, dt, duration);
    StepEff(eff.surfaceUnitOpacity, dt, duration);

    const surfOp = eff.surfaceOpacity.value;
    matHex.opacity = surfOp;
    matHex.depthWrite = surfOp > 0.6;
    matRoad.opacity = surfOp;
    matProps.opacity = surfOp;
    matProps.depthWrite = surfOp > 0.6;
    matGrid.opacity = 0.85 * surfOp;
    matRoof.opacity = (1 - surfOp) * 0.55;   // 地上退化时浮出屋顶线框

    const underB = eff.underBrightness.value;
    matPad.opacity = 0.9 * underB;
    matPadEdge.opacity = 0.9 * underB;
    matTube.opacity = Clamp01(underB);
    matTopo.opacity = Clamp(underB, 0.12, 0.5);   // 拓扑线：地上态即 15% 基线
    matShaft.opacity = 0.8 * underB;
    matFacility.opacity = underB;
    matDoor.opacity = underB;
    matSmoke.opacity = 0.55 * underB;
    matRingUnder.opacity = underB;
    matVentUnder.opacity = underB;
    matBadgeUnder.opacity = underB;
    matBadgeSurface.opacity = Clamp(surfOp + 0.25, 0.45, 1);
    matIntent.opacity = 0.95 * Clamp(surfOp + 0.2, 0.4, 1);
    matIntentHead.opacity = matIntent.opacity;

    // 高亮层跟随所属层的明暗：给地下单位画的可达/路径，在地上态就随拓扑线一起退到 15%，
    // 不会隔着地皮泄漏一片亮青（§六.2 地上态不显示地下单位）。窥视时随之提亮。
    const dim = overlayLayer === "under" ? Clamp01(underB) : Clamp(surfOp + 0.25, 0.35, 1);
    const breathe = 1 - theme.highlight.edgePulse * (0.5 + 0.5 * Math.sin(performance.now() / 420));
    matReachFill.opacity = theme.highlight.reachableOpacity * dim;
    matReachEdge.opacity = theme.highlight.edgeOpacity * breathe * dim;
    matPath.opacity = 0.96 * dim;
    matPathRisk.opacity = 0.96 * dim;
    matPathArrow.opacity = 0.98 * dim;
    matDest.opacity = 0.95 * dim;
    matDestOutline.opacity = 0.9 * dim;
    matCost.opacity = dim;

    // 单位可见性：地上态不显示地下单位（保护隐蔽感）；窥视/地下态显示
    const showUnder = viewState.layer === "under" || viewState.peek || eff.underBrightness.value > 0.6;
    gUnitUnder.visible = showUnder;
    const unitOp = eff.surfaceUnitOpacity.value;
    for (const visual of viewState.unitVisuals.values()) {
      const layerOp = visual.layer === "under" ? 1 : unitOp;
      const opacity = (visual.baseOpacity ?? 1) * layerOp;
      visual.material.opacity = opacity;
      visual.sprite.material.opacity = Clamp(layerOp + 0.15, 0, 1);
      visual.material.depthWrite = opacity > 0.7;
    }
    for (const mesh of viewState.ghostMeshes) mesh.material.opacity = 0.35 * unitOp;
  }

  // ---------------- 相机 ----------------

  function CameraOffset(distance) {
    return new THREE.Vector3(0, Math.sin(cameraPitchRad) * distance, Math.cos(cameraPitchRad) * distance);
  }

  function UpdateCamera(dt) {
    // 缩放补间
    const wanted = zoomDistances[camState.zoomIndex];
    camState.zoomCurrent += (wanted - camState.zoomCurrent) * Math.min(1, dt / 90);
    // 聚焦补间
    if (camState.focusTween) {
      const tween = camState.focusTween;
      tween.elapsed += dt;
      const t = Clamp01(tween.elapsed / tween.duration);
      const ease = t * t * (3 - 2 * t);
      camState.target.lerpVectors(tween.fromT, tween.toT, ease);
      if (t >= 1) { tween.resolve?.(); camState.focusTween = null; }
    }
    camState.target.x = Clamp(camState.target.x, camState.bounds.minX, camState.bounds.maxX);
    camState.target.z = Clamp(camState.target.z, camState.bounds.minZ, camState.bounds.maxZ);
    camera.position.copy(camState.target).add(CameraOffset(camState.zoomCurrent));
    camera.lookAt(camState.target);
  }

  function PanBy(dx, dz) {
    camState.target.x += dx;
    camState.target.z += dz;
    camState.focusTween = null;
  }

  function PanByPixels(px, py) {
    const scale = camState.zoomCurrent / renderer.domElement.clientHeight * 1.35;
    PanBy(-px * scale, -py * scale / Math.sin(cameraPitchRad));
  }

  function ZoomStep(delta) {
    camState.zoomIndex = Clamp(camState.zoomIndex + delta, 0, zoomDistances.length - 1);
  }

  function FocusHex(key, duration = 300) {
    if (!key) return Promise.resolve();
    const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
    return new Promise((resolve) => {
      camState.focusTween = {
        fromT: camState.target.clone(),
        toT: new THREE.Vector3(world.x, 0, world.z),
        elapsed: 0, duration: Math.max(1, duration), resolve,
      };
    });
  }

  function PulseHex(key, layer = "surface") {
    if (!viewState.focusPulse.mesh) {
      const mesh = new THREE.Mesh(ringGeom, matFocus);
      mesh.renderOrder = 11;
      gOverlay.add(mesh);
      viewState.focusPulse.mesh = mesh;
    }
    const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
    viewState.focusPulse.mesh.position.set(world.x, LayerY(key, layer) + 0.08, world.z);
    viewState.focusPulse.t = 0;
  }

  // ---------------- 拾取（当前层优先，Alt 跨层） ----------------

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function PickAt(clientX, clientY, { layer } = {}) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointerNdc, camera);
    const pickLayer = layer ?? viewState.layer;

    // 1) 单位（仅当前可拾取层）
    const unitGroup = pickLayer === "under" ? gUnitUnder : gUnitSurface;
    const hits = raycaster.intersectObjects(unitGroup.children, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && node.userData.unitId === undefined) node = node.parent;
      const unitId = node?.userData.unitId;
      if (unitId !== undefined && viewState.unitVisuals.get(unitId)) {
        return { kind: "unit", unitId, hexKey: viewState.unitVisuals.get(unitId).unit.pos, layer: pickLayer };
      }
    }
    // 2) 层平面 → 六角格
    const planeY = pickLayer === "under" ? underY : 0.38;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, point)) return null;
    const axial = WorldToHex(point.x, point.z);
    const hexKey = HexKey(axial.q, axial.r);
    if (!viewState.vm?.hexes?.[hexKey]) return null;
    return { kind: "hex", hexKey, layer: pickLayer };
  }

  function ProjectHexToScreen(key, layer = "surface") {
    const world = HexToWorld(ParseHexKey(key).q, ParseHexKey(key).r);
    const vector = new THREE.Vector3(world.x, LayerY(key, layer), world.z).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - vector.y) / 2) * rect.height,
      inFront: vector.z < 1,
    };
  }

  // ---------------- 主循环 ----------------

  function Resize() {
    const width = canvas.clientWidth || 1280;
    const height = canvas.clientHeight || 720;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function Frame(dt) {
    ApplyLayerFrame(dt);
    UpdateCamera(dt);
    // 单位移动补间
    for (const visual of viewState.unitVisuals.values()) {
      if (visual.tween) {
        visual.tween.t += dt / visual.tween.duration;
        const t = Clamp01(visual.tween.t);
        const ease = t * t * (3 - 2 * t);
        visual.root.position.lerpVectors(visual.tween.from, visual.tween.to, ease);
        if (t >= 1) visual.tween = null;
      }
    }
    // 选中脉冲
    if (selectRing?.visible) {
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 260);
      selectRing.scale.setScalar(pulse);
    }
    // 落点环脉冲
    if (destRing?.visible) {
      const pulse = 1 + 0.1 * Math.sin(performance.now() / 220);
      destRing.scale.set(pulse, 1, pulse);
    }
    // 代价牌：随相机距离反向缩放，三档缩放下屏幕上大小一致（不至于近处糊脸、远处看不清）
    if (costMesh?.visible && costMesh.userData.plate) {
      const k = camState.zoomCurrent / zoomDistances[1];
      const plate = costMesh.userData.plate;
      costMesh.scale.set(plate.width * k, plate.height * k, 1);
    }
    // 聚焦脉冲
    if (viewState.focusPulse.mesh && viewState.focusPulse.t < 1) {
      viewState.focusPulse.t = Math.min(1, viewState.focusPulse.t + dt / 700);
      const t = viewState.focusPulse.t;
      viewState.focusPulse.mesh.scale.setScalar(1 + t * 2.2);
      matFocus.opacity = (1 - t) * 0.85;
    }
    renderer.render(scene, camera);
    // fps 统计
    viewState.statsFrames += 1;
    viewState.statsTime += dt;
    if (viewState.statsTime >= 1000) {
      viewState.fps = Math.round((viewState.statsFrames * 1000) / viewState.statsTime);
      viewState.statsFrames = 0;
      viewState.statsTime = 0;
    }
  }

  function Dispose() {
    ClearGroup(gSurface, mapDisposables);
    ClearGroup(gUnder, disposables);
    ClearPathTubes();
    for (const texture of labelTextureCache.values()) texture.dispose();
    for (const entry of costTextureCache.values()) entry.texture.dispose();
    atlas.texture.dispose();
    renderer.dispose();
  }

  Resize();

  return {
    SetMap, SetView, SetLayer, SetPeek, SetSelection, SetReachable, SetPath, SetHover,
    FocusHex, PulseHex, PickAt, ProjectHexToScreen,
    PanBy, PanByPixels, ZoomStep, Frame, Resize, Dispose,
    GetLayer: () => viewState.layer,
    GetZoomIndex: () => camState.zoomIndex,
    /** 只读自检口（验收脚本用；不参与玩法）。 */
    DebugOverlay: () => ({
      reachable: { count: reach.count, keys: reach.keys.slice(), farthest: reach.farthest, layer: reach.layer },
      path: pathState.active ? pathState.keys.slice() : null,
      pathRisk: pathState.risk,
      hover: viewState.hoverKey,
      selection: viewState.selection ? { ...viewState.selection } : null,
    }),
    Stats: () => ({ fps: viewState.fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    camera, scene, renderer,
  };
}
