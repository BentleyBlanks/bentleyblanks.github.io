/**
 * Script_World.mjs — 地形 / 黑石峪村 / 碰撞 / 导航 / 掩体 / 视线 / 遮挡 / 交互物 / 脚印
 * Owner: AgentWorld
 *
 * 设计要点
 * ---------------------------------------------------------------------------
 * 1) 高度场是**唯一事实**：地形网格、碰撞、导航、放置全部读同一张 heightGrid，
 *    永远不会出现「看着是坡，走上去穿模」。
 * 2) 静态几何按「材质族 × 空间分区」合并成大网格（自写 MergeBatch，零外部依赖），
 *    树 / 岩石 / 篱笆桩用 InstancedMesh。draw call 常驻 30 上下。
 * 3) 顶点色承担三件事：调色板底色、朝上面的积雪、贴地的接触暗部。
 *    材质一律 `MakeVariant(key, ..., { vertexColors:true, color:0xffffff })`，
 *    所以「烧黑的墙」不会掉进黑洞——World 自己控制它的实际亮度。
 * 4) 关卡可读性不靠箭头：夯土院墙夹出巷道、踩实的雪路把人往北带、
 *    地标（磨坊 / 牌坊 / 碉堡 / 灯塔）永远在正确的方向上。
 *
 * 依赖 DAG：three, Config, Math, Art（只取材质与动态光）。禁止 import Character / Player / EnemyAi。
 */

import * as THREE from 'three';
import { Config, Palette } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';

const WorldConfig = Config.World;

/* ================================================================== *
 * 〇、通用小工具
 * ================================================================== */

/** 无方向限制的 smoothstep：a 可以大于 b。 */
function Ramp(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = MathUtil.Clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** 高斯钟形，用来做河谷 / 豁口 / 路堑这类「局部凹陷」。 */
function Bell(value, width) {
  const t = value / width;
  return Math.exp(-t * t);
}

/** 折线路径：关卡的主动线。地形沿它压平，玩家沿它走。 */
function CreateRoute(points) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.sqrt(dx * dx + dz * dz) || 1e-5;
    segments.push({ ax: a.x, az: a.z, dx: dx / length, dz: dz / length, length: length,
      widthA: a.width, widthB: b.width, start: total });
    total += length;
  }
  return { points: points, segments: segments, length: total };
}

const routeResult = { lateral: 0, cx: 0, cz: 0, width: 0, travel: 0 };

function QueryRoute(route, x, z) {
  let bestSq = Infinity;
  const segments = route.segments;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const rx = x - s.ax;
    const rz = z - s.az;
    let t = rx * s.dx + rz * s.dz;
    if (t < 0) t = 0; else if (t > s.length) t = s.length;
    const px = s.ax + s.dx * t;
    const pz = s.az + s.dz * t;
    const ddx = x - px;
    const ddz = z - pz;
    const distanceSq = ddx * ddx + ddz * ddz;
    if (distanceSq < bestSq) {
      bestSq = distanceSq;
      routeResult.cx = px;
      routeResult.cz = pz;
      routeResult.width = MathUtil.Lerp(s.widthA, s.widthB, t / s.length);
      routeResult.travel = s.start + t;
    }
  }
  routeResult.lateral = Math.sqrt(bestSq);
  return routeResult;
}

/* ================================================================== *
 * 一、几何原型库（共享，Dispose 时统一释放）
 * ================================================================== */

/** 非索引三角汤 → 平面法线几何。合并时 UV 由世界坐标现算，所以原型不需要 UV。 */
function FlatGeometry(triangles) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function PushQuad(list, a, b, c, d) {
  list.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  list.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
}

function CreateGeometryLibrary() {
  const library = {};
  library.box = new THREE.BoxGeometry(1, 1, 1);
  library.cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  library.cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  library.cyl12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1);
  library.cylOpen = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true);
  library.taper = new THREE.CylinderGeometry(0.34, 0.5, 1, 6, 1);
  library.cone = new THREE.ConeGeometry(0.5, 1, 8, 1);
  library.cone6 = new THREE.ConeGeometry(0.5, 1, 6, 1);
  library.coneOpen = new THREE.ConeGeometry(0.5, 1, 7, 1, true);
  library.ico = new THREE.IcosahedronGeometry(0.5, 1);
  library.icoLow = new THREE.IcosahedronGeometry(0.5, 0);
  library.sphere = new THREE.SphereGeometry(0.5, 8, 6);
  library.torus = new THREE.TorusGeometry(0.42, 0.08, 5, 12);

  /* 楔形雪堆 / 塌方斜坡：从 x=-0.5 的顶缘斜到 x=+0.5 的地面 */
  const wedge = [];
  const A = [-0.5, 1, -0.5]; const B = [-0.5, 1, 0.5];
  const C = [-0.5, 0, -0.5]; const D = [-0.5, 0, 0.5];
  const E = [0.5, 0, -0.5]; const F = [0.5, 0, 0.5];
  PushQuad(wedge, A, B, F, E);
  PushQuad(wedge, B, A, C, D);
  PushQuad(wedge, C, E, F, D);
  wedge.push(A[0], A[1], A[2], E[0], E[1], E[2], C[0], C[1], C[2]);
  wedge.push(B[0], B[1], B[2], D[0], D[1], D[2], F[0], F[1], F[2]);
  library.wedge = FlatGeometry(wedge);

  /* 双坡屋面的半片：一块带厚度的斜板，方便按檩条角度摆 */
  library.slab = new THREE.BoxGeometry(1, 1, 1);

  /* 朝上的方片：地面贴片（冰面、谷壳、灰烬） */
  library.quad = new THREE.PlaneGeometry(1, 1);
  library.quad.rotateX(-Math.PI / 2);

  /* 竖直方片：布、纸、旗 */
  library.panel = new THREE.PlaneGeometry(1, 1);

  return library;
}

/* ================================================================== *
 * 二、材质族（一族 = 一种贴图手感；颜色全部走顶点色）
 * ================================================================== */

const SurfaceFamilies = {
  Earth: { key: 'MudWall', uvScale: 0.36, shadow: true },
  Stone: { key: 'StoneWall', uvScale: 0.42, shadow: true },
  Rock: { key: 'Rock', uvScale: 0.20, shadow: true },
  Timber: { key: 'WoodOld', uvScale: 0.58, shadow: true },
  Charred: { key: 'CharredWood', uvScale: 0.46, shadow: true },
  Straw: { key: 'Straw', uvScale: 0.52, shadow: true },
  Snow: { key: 'SnowPacked', uvScale: 0.14, shadow: true },
  Metal: { key: 'MetalRust', uvScale: 0.5, shadow: true },
  Cloth: { key: 'ClothCoarse', uvScale: 0.62, shadow: false },
  Ice: { key: 'Ice', uvScale: 0.08, shadow: false },
  Leaf: { key: 'FoliageDead', uvScale: 0.5, shadow: false },
  Paper: { key: 'PaperWindow', uvScale: 0.5, shadow: false },
  Ash: { key: 'Dirt', uvScale: 0.3, shadow: false },
};

/* 远景用的低对比族：只做剪影层次，不参与任何逻辑 */
const RidgeFamily = { key: 'RockDark', uvScale: 0.06, shadow: false };

/** 小件才做距离剔除：碗、鞋、纸、布这些 30m 外根本看不见。 */
const DetailFamilies = { Paper: 55, Cloth: 62, Ash: 48, Leaf: 70 };

/* ================================================================== *
 * 三、合并批次（自写，替代 BufferGeometryUtils，零外部依赖）
 * ================================================================== */

const batchMatrix = new THREE.Matrix4();
const batchNormalMatrix = new THREE.Matrix3();
const batchVector = new THREE.Vector3();
const batchNormal = new THREE.Vector3();
const batchColor = new THREE.Color();
const batchSnow = new THREE.Color();
const batchSoot = new THREE.Color();

function CreateBatch() {
  return { position: [], normal: [], uv: [], color: [], index: [], vertices: 0 };
}

/**
 * 把一份原型几何按 matrix 变换后并入批次。
 * UV 用世界坐标三平面投影现算 —— 纹素密度全场一致，也顺便打碎「一眼盒子」的观感。
 * 顶点色 = 调色板底色 →（朝上面）积雪 →（贴地）接触暗部 →（可选）烟熏。
 */
function AppendPiece(batch, geometry, matrix, style) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const index = geometry.index;
  const base = batch.vertices;
  const count = positions.count;
  batchNormalMatrix.getNormalMatrix(matrix);

  const uvScale = style.uvScale;
  const snowAmount = style.snow;
  const aoAmount = style.ao;
  const sootAmount = style.soot;
  const groundY = style.groundY;
  const tone = style.tone;

  batchColor.setHex(style.color);
  const baseR = batchColor.r * tone;
  const baseG = batchColor.g * tone;
  const baseB = batchColor.b * tone;
  batchSnow.setHex(style.snowColor);
  batchSoot.setHex(Palette.SootBlack);

  for (let i = 0; i < count; i += 1) {
    batchVector.fromBufferAttribute(positions, i).applyMatrix4(matrix);
    batchNormal.fromBufferAttribute(normals, i).applyMatrix3(batchNormalMatrix).normalize();
    const x = batchVector.x;
    const y = batchVector.y;
    const z = batchVector.z;
    const nx = batchNormal.x;
    const ny = batchNormal.y;
    const nz = batchNormal.z;
    batch.position.push(x, y, z);
    batch.normal.push(nx, ny, nz);

    /* —— 三平面 UV —— */
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let u; let v;
    if (ay >= ax && ay >= az) { u = x * uvScale; v = z * uvScale; }
    else if (ax >= az) { u = z * uvScale; v = y * uvScale; }
    else { u = x * uvScale; v = y * uvScale; }
    batch.uv.push(u, v);

    /* —— 顶点色 —— */
    const snowT = snowAmount * Ramp(0.32, 0.86, ny);
    let r = baseR + (batchSnow.r - baseR) * snowT;
    let g = baseG + (batchSnow.g - baseG) * snowT;
    let b = baseB + (batchSnow.b - baseB) * snowT;
    if (sootAmount > 0) {
      const sootT = sootAmount * Ramp(0.1, 1.5, y - groundY) * (1 - snowT);
      r += (batchSoot.r - r) * sootT;
      g += (batchSoot.g - g) * sootT;
      b += (batchSoot.b - b) * sootT;
    }
    /* 贴地的接触暗部 + 朝下的面压暗：让东西「坐」在雪里，而不是浮着 */
    const contact = Ramp(0.62, 0.02, y - groundY) * aoAmount;
    const downward = MathUtil.Clamp01(-ny) * 0.3 * aoAmount;
    const shade = 1 - MathUtil.Clamp01(contact * 0.5 + downward);
    batch.color.push(r * shade, g * shade, b * shade);
  }

  if (index) {
    for (let i = 0; i < index.count; i += 1) batch.index.push(base + index.getX(i));
  } else {
    for (let i = 0; i < count; i += 1) batch.index.push(base + i);
  }
  batch.vertices += count;
}

function FinishBatch(batch) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.color, 3));
  geometry.setIndex(batch.index);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/* ================================================================== *
 * 四、二叉堆（A* 用；灰盒的线性扫描在 128×128 网格上是 O(n²)）
 * ================================================================== */

function CreateHeap() {
  const items = [];
  const scores = [];
  return {
    size: 0,
    Clear() { items.length = 0; scores.length = 0; this.size = 0; },
    Push(value, score) {
      let i = this.size;
      items[i] = value; scores[i] = score; this.size += 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (scores[parent] <= scores[i]) break;
        const tv = items[parent]; items[parent] = items[i]; items[i] = tv;
        const ts = scores[parent]; scores[parent] = scores[i]; scores[i] = ts;
        i = parent;
      }
    },
    Pop() {
      const top = items[0];
      this.size -= 1;
      if (this.size > 0) {
        items[0] = items[this.size]; scores[0] = scores[this.size];
        let i = 0;
        for (;;) {
          const left = i * 2 + 1;
          const right = left + 1;
          let best = i;
          if (left < this.size && scores[left] < scores[best]) best = left;
          if (right < this.size && scores[right] < scores[best]) best = right;
          if (best === i) break;
          const tv = items[best]; items[best] = items[i]; items[i] = tv;
          const ts = scores[best]; scores[best] = scores[i]; scores[i] = ts;
          i = best;
        }
      }
      return top;
    },
  };
}

/* ================================================================== *
 * 五、三幕分区定义（地貌骨架 + 主动线）
 * ================================================================== */

const Layouts = {
  /* 第一幕【雪窖】：太行山凹里的一个小盆地。南来北去，村道贯穿。 */
  Village: {
    weather: 'LightSnow',
    windDeg: 285,
    route: [
      { x: 9, z: 56, width: 5.0 }, { x: 6, z: 34, width: 5.4 }, { x: 1.5, z: 12, width: 6.2 },
      { x: -1, z: -2, width: 7.0 }, { x: -4, z: -18, width: 5.6 }, { x: -7, z: -38, width: 4.6 },
      { x: -7, z: -58, width: 4.2 },
    ],
    Base(x, z) {
      let h = MathUtil.Fbm2(x * 0.033 + 11.3, z * 0.033 - 7.1, 4, 2.05, 0.5) * 2.4;
      const r = Math.sqrt(x * x * 0.82 + (z + 2) * (z + 2) * 0.60);
      const rim = Ramp(23, 62, r);
      h += rim * rim * 20;
      h += MathUtil.Ridge2(x * 0.013 + 3.1, z * 0.013 + 1.7, 3) * rim * 10;
      /* 东坡缓抬，坡上是梯田。只在中段做台阶——太高就成金字塔了。 */
      const east = Ramp(12, 48, x);
      h += east * 4.6;
      const terrace = Ramp(20, 30, x) * (1 - Ramp(40, 52, x)) * (1 - Ramp(10, 15, h));
      if (terrace > 0.02) {
        const stepped = Math.floor(h / 1.55) * 1.55 + 0.42;
        h = MathUtil.Lerp(h, stepped, terrace * 0.85);
      }
      /* 西边的河沟：南北向，沟底是冻住的溪面 */
      h -= Bell(x + 33 + Math.sin(z * 0.045) * 4.5, 7.5) * 5.4;
      /* 北面山梁的豁口——村子唯一的出口 */
      h -= Bell(x + 7, 11) * Ramp(-24, -52, z) * 14;
      /* 南面来路 */
      h -= Bell(x - 9, 10) * Ramp(28, 54, z) * 10;
      return h;
    },
  },

  /* 第二幕【断谷】：一条南北向的山谷，公路贴着谷底走，中间一道被炸断的石桥。 */
  Valley: {
    weather: 'Overcast',
    windDeg: 270,
    route: [
      { x: 8, z: 68, width: 6.0 }, { x: 4, z: 44, width: 6.4 }, { x: 1, z: 26, width: 6.4 },
      { x: -5, z: 17, width: 4.2 }, { x: 1, z: 8, width: 6.0 }, { x: -1, z: -6, width: 7.2 },
      { x: -4, z: -28, width: 5.6 }, { x: -8, z: -52, width: 4.6 }, { x: -9, z: -70, width: 4.2 },
    ],
    Base(x, z) {
      let h = MathUtil.Fbm2(x * 0.030 + 5.1, z * 0.030 + 2.7, 4, 2.05, 0.5) * 1.9;
      const centre = Math.sin(z * 0.021) * 6.5 - 1.5;
      const lateral = Math.abs(x - centre);
      const wall = Ramp(12, 44, lateral);
      h += wall * wall * 32;
      h += MathUtil.Ridge2(x * 0.020 + 9.3, z * 0.020 + 4.4, 3) * wall * 12;
      h += z * 0.038;
      /* 断桥下的横沟 */
      h -= Bell(z - 17, 7.2) * (1 - Ramp(26, 42, lateral)) * 6.4;
      /* 哨卡那段谷底压平放宽 */
      const post = Bell(z + 6, 13) * (1 - Ramp(9, 19, lateral));
      h = MathUtil.Lerp(h, h * 0.55 - 0.5, post * 0.85);
      return h;
    },
  },

  /* 第三幕【风雪垭口】：一路往北爬，穿过岩缝，翻过垭口，再往下走。 */
  Pass: {
    weather: 'Blizzard',
    windDeg: 250,
    route: [
      { x: 5, z: 64, width: 5.4 }, { x: 2, z: 46, width: 5.0 }, { x: -1, z: 31, width: 4.2 },
      { x: -2, z: 22, width: 2.9 }, { x: -2, z: 12, width: 2.9 }, { x: 2, z: 1, width: 5.0 },
      { x: 7, z: -16, width: 5.4 }, { x: 2, z: -38, width: 5.8 }, { x: 0, z: -62, width: 5.2 },
    ],
    Base(x, z) {
      let h = MathUtil.Fbm2(x * 0.028 + 17.7, z * 0.028 - 3.3, 4, 2.05, 0.5) * 2.6;
      const climb = Ramp(64, -4, z);
      h += climb * 25;
      h -= Ramp(-6, -60, z) * 15;
      const shoulder = Ramp(46, -12, z);
      h += Bell(x + 31, 19) * 27 * shoulder;
      h += Bell(x - 30, 18) * 25 * shoulder;
      h += MathUtil.Ridge2(x * 0.017 + 2.2, z * 0.017 + 8.8, 4) * (0.35 + climb * 0.9) * 12;
      /* 岩缝：山脊被一道窄缝劈开，是唯一能上去的路 */
      h -= Bell(x - 2, 3.4) * Bell(z - 17, 10) * 16;
      return h;
    },
  },
};

/* ================================================================== *
 * 六、World
 * ================================================================== */

export function CreateWorld(ctx, options) {
  const settings = options || {};
  const chapterId = settings.chapterId || 'ChapterSnowCellar';
  const preset = Layouts[settings.preset] ? settings.preset : 'Village';
  const layout = Layouts[preset];
  const seed = settings.seed === undefined ? 19431217 : settings.seed;
  const presetData = WorldConfig.Presets[preset] || WorldConfig.Presets.Village;
  const random = MathUtil.CreateRandom(seed);
  const art = ctx.art;
  const quality = ctx.quality || 'high';

  /* 断谷是「长谷窄壁」，所以把配置里的两个跨度按方向摆正 */
  const spanX = preset === 'Valley' ? Math.min(presetData.spanX, presetData.spanZ) : presetData.spanX;
  const spanZ = preset === 'Valley' ? Math.max(presetData.spanX, presetData.spanZ) : presetData.spanZ;
  const bounds = { minX: -spanX / 2, maxX: spanX / 2, minZ: -spanZ / 2, maxZ: spanZ / 2 };

  const group = new THREE.Group();
  group.name = 'GroupWorld_' + preset;

  const geometryLibrary = CreateGeometryLibrary();
  const ownedGeometry = [];
  const lightHandles = [];
  const route = CreateRoute(layout.route);
  const windRadians = layout.windDeg * MathUtil.DegToRad;
  const windX = Math.sin(windRadians);
  const windZ = Math.cos(windRadians);

  /* ---------------------------------------------------------------- *
   * 6.1 高度场 —— 全局唯一事实源
   * ---------------------------------------------------------------- */

  const terrainStep = quality === 'low' ? 1.6 : 1.0;
  const gridCols = Math.round(spanX / terrainStep) + 1;
  const gridRows = Math.round(spanZ / terrainStep) + 1;
  const heightGrid = new Float32Array(gridCols * gridRows);
  const laneGrid = new Float32Array(gridCols * gridRows);
  /* 0 雪 · 1 踩实的土路 · 2 石 · 3 冰 · 4 谷壳/干草 */
  const surfaceGrid = new Uint8Array(gridCols * gridRows);
  const SurfaceNames = ['Snow', 'Dirt', 'Stone', 'Ice', 'Straw'];

  /* 网格间距由「取整后的格数」反推，保证地形网格顶点与高度场节点一一对应 */
  const stepX = spanX / (gridCols - 1);
  const stepZ = spanZ / (gridRows - 1);
  function GridX(col) { return bounds.minX + col * stepX; }
  function GridZ(row) { return bounds.minZ + row * stepZ; }

  /* 河谷冰面只在第一幕有；第二幕沟底是碎石，第三幕是硬雪 */
  function IceMask(x, z) {
    if (preset !== 'Village') return 0;
    return Bell(x + 33 + Math.sin(z * 0.045) * 4.5, 3.6) * Ramp(-56, -46, -Math.abs(z));
  }

  for (let row = 0; row < gridRows; row += 1) {
    const z = GridZ(row);
    for (let col = 0; col < gridCols; col += 1) {
      const x = GridX(col);
      const index = row * gridCols + col;
      const base = layout.Base(x, z);
      const query = QueryRoute(route, x, z);
      const half = query.width * 0.5;
      const lane = 1 - Ramp(half, half + 3.2, query.lateral);
      let height = base;
      if (lane > 0.001) {
        const laneHeight = layout.Base(query.cx, query.cz) - 0.28;
        height = MathUtil.Lerp(base, laneHeight, lane * 0.94);
      }
      /* 背风处堆雪：地形自己长出雪窝，潜行时是天然的藏身处 */
      const drift = MathUtil.Fbm2(x * 0.09 + 31.7, z * 0.09 - 12.1, 3, 2.1, 0.55);
      height += MathUtil.Clamp01(drift) * WorldConfig.snowDepthMax * (1 - lane * 0.8);
      heightGrid[index] = height;
      laneGrid[index] = lane;
    }
  }

  /**
   * 高度采样。**必须与地形网格的三角划分一致**，否则台阶与陡坡上角色会浮空 / 陷进去。
   * PlaneGeometry 把每格切成 (a,b,d) 与 (b,c,d) 两片，对角线是 (col,row+1)—(col+1,row)。
   */
  function SampleHeight(x, z) {
    const fx = MathUtil.Clamp((x - bounds.minX) / stepX, 0, gridCols - 1.0001);
    const fz = MathUtil.Clamp((z - bounds.minZ) / stepZ, 0, gridRows - 1.0001);
    const col = fx | 0;
    const row = fz | 0;
    const tx = fx - col;
    const tz = fz - row;
    const i0 = row * gridCols + col;
    const i1 = i0 + gridCols;
    const h00 = heightGrid[i0];
    const h10 = heightGrid[i0 + 1];
    const h01 = heightGrid[i1];
    const h11 = heightGrid[i1 + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  function SampleLane(x, z) {
    const col = MathUtil.Clamp(Math.round((x - bounds.minX) / stepX), 0, gridCols - 1);
    const row = MathUtil.Clamp(Math.round((z - bounds.minZ) / stepZ), 0, gridRows - 1);
    return laneGrid[row * gridCols + col];
  }

  function TerrainNormal(x, z, out) {
    const hL = SampleHeight(x - stepX, z);
    const hR = SampleHeight(x + stepX, z);
    const hD = SampleHeight(x, z - stepZ);
    const hU = SampleHeight(x, z + stepZ);
    return (out || new THREE.Vector3()).set((hL - hR) * stepZ, stepX * stepZ * 2, (hD - hU) * stepX).normalize();
  }

  function TerrainSteep(x, z) {
    const dx = (SampleHeight(x + stepX, z) - SampleHeight(x - stepX, z)) / (stepX * 2);
    const dz = (SampleHeight(x, z + stepZ) - SampleHeight(x, z - stepZ)) / (stepZ * 2);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** 一件东西脚下的地：取一小片footprint的最低点。斜坡上不这么做就会有一半悬空。 */
  function GroundUnder(x, z, radius) {
    let low = SampleHeight(x, z);
    const r = radius || 0.8;
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI * 0.5 + 0.4;
      const value = SampleHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (value < low) low = value;
    }
    return low;
  }

  /* 表面分类：路 / 冰 / 裸岩 / 雪 */
  for (let row = 0; row < gridRows; row += 1) {
    const z = GridZ(row);
    for (let col = 0; col < gridCols; col += 1) {
      const x = GridX(col);
      const index = row * gridCols + col;
      const ice = IceMask(x, z);
      let kind = 0;
      if (ice > 0.5) kind = 3;
      else if (laneGrid[index] > 0.55) kind = 1;
      else if (TerrainSteep(x, z) > 0.85) kind = 2;
      surfaceGrid[index] = kind;
    }
  }

  function SampleGroundKind(x, z) {
    const col = MathUtil.Clamp(Math.round((x - bounds.minX) / stepX), 0, gridCols - 1);
    const row = MathUtil.Clamp(Math.round((z - bounds.minZ) / stepZ), 0, gridRows - 1);
    return SurfaceNames[surfaceGrid[row * gridCols + col]];
  }

  function PaintSurface(x, z, radius, kind) {
    const colMin = MathUtil.Clamp(Math.floor((x - radius - bounds.minX) / stepX), 0, gridCols - 1);
    const colMax = MathUtil.Clamp(Math.ceil((x + radius - bounds.minX) / stepX), 0, gridCols - 1);
    const rowMin = MathUtil.Clamp(Math.floor((z - radius - bounds.minZ) / stepZ), 0, gridRows - 1);
    const rowMax = MathUtil.Clamp(Math.ceil((z + radius - bounds.minZ) / stepZ), 0, gridRows - 1);
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let col = colMin; col <= colMax; col += 1) {
        if (MathUtil.DistanceSq2(GridX(col), GridZ(row), x, z) > radius * radius) continue;
        surfaceGrid[row * gridCols + col] = kind;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.2 地形网格（顶点色：雪 / 踩实的路 / 裸岩 / 冰，外加高度分层）
   * ---------------------------------------------------------------- */

  const terrainGeometry = new THREE.PlaneGeometry(spanX, spanZ, gridCols - 1, gridRows - 1);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainColors = new Float32Array(terrainPositions.count * 3);
  const colorSnowLit = new THREE.Color(Palette.SnowLit);
  const colorSnowMid = new THREE.Color(Palette.SnowMid);
  const colorSnowShadow = new THREE.Color(Palette.SnowShadow);
  const colorTrampled = new THREE.Color(Palette.SnowTrampled);
  const colorRock = new THREE.Color(Palette.Rock);
  const colorIce = new THREE.Color(Palette.Ice);
  const colorMix = new THREE.Color();
  const colorTmp = new THREE.Color();

  for (let i = 0; i < terrainPositions.count; i += 1) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const height = SampleHeight(x, z);
    terrainPositions.setY(i, height);
    const steep = TerrainSteep(x, z);
    const lane = SampleLane(x, z);
    const grain = MathUtil.Noise2(x * 0.19, z * 0.19) * 0.5 + MathUtil.Noise2(x * 0.041, z * 0.041) * 0.5;
    /* 雪面本身要有层次：迎风的坡亮，背风的窝暗，不是一张白纸 */
    TerrainNormal(x, z, batchNormal);
    const facing = MathUtil.Clamp01(0.5 + (batchNormal.x * windX + batchNormal.z * windZ) * 0.6);
    colorMix.copy(colorSnowShadow).lerp(colorSnowMid, 0.45);
    colorMix.lerp(colorSnowLit, MathUtil.Clamp01(0.30 + grain * 0.26 + facing * 0.34));
    colorMix.lerp(colorRock, MathUtil.Clamp01((steep - 0.70) * 1.0) * 0.85);
    colorMix.lerp(colorTrampled, lane * 0.82);
    /* 两道车辙：烘在顶点色里，无接缝、零 draw call。踩实的路本身就是路标。 */
    if (lane > 0.25) {
      const query = QueryRoute(route, x, z);
      const rut = Math.exp(-Math.pow((query.lateral - 0.66) / 0.34, 2))
        + Math.exp(-Math.pow((query.lateral - 1.62) / 0.30, 2)) * 0.6;
      colorMix.multiplyScalar(1 - MathUtil.Clamp01(rut) * lane * 0.20);
    }
    const ice = IceMask(x, z);
    if (ice > 0.001) colorMix.lerp(colorIce, MathUtil.Clamp01(ice * 1.3));
    terrainColors[i * 3] = colorMix.r;
    terrainColors[i * 3 + 1] = colorMix.g;
    terrainColors[i * 3 + 2] = colorMix.b;
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  /* UV 用世界坐标算：PlaneGeometry 自带的 0—1 UV 会把陡崖拉成瓦楞板 */
  const terrainUv = terrainGeometry.attributes.uv;
  for (let i = 0; i < terrainPositions.count; i += 1) {
    terrainUv.setXY(i, terrainPositions.getX(i) * 0.22, terrainPositions.getZ(i) * 0.22);
  }
  terrainUv.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  const terrainMaterial = art.MakeVariant('SnowGround', 'WorldTerrain', {
    vertexColors: true, color: 0xffffff, roughness: 0.95,
  });
  /* MakeVariant 给每个变体克隆了自己的贴图，这里改 repeat 不会污染别人 */
  if (terrainMaterial.map) terrainMaterial.map.repeat.set(1, 1);
  const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.name = 'MeshTerrain';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  group.add(terrainMesh);
  ownedGeometry.push(terrainGeometry);

  /* ---------------------------------------------------------------- *
   * 6.3 远景山脊 —— 天际线的层次感（无碰撞、无逻辑，只负责「景深」）
   * ---------------------------------------------------------------- */

  function BuildDistantRidges() {
    const material = art.MakeVariant(RidgeFamily.key, 'WorldRidge', {
      vertexColors: true, color: 0xffffff, roughness: 1.0, fog: true,
    });
    const bands = [
      { radius: spanX * 0.56, height: 21, tint: 0.42, segments: 96 },
      { radius: spanX * 0.74, height: 33, tint: 0.66, segments: 80 },
      { radius: spanX * 0.96, height: 47, tint: 0.84, segments: 64 },
    ];
    const fogColor = new THREE.Color(Palette.FogWinter);
    const ridgeColor = new THREE.Color(Palette.RockDark);
    for (let b = 0; b < bands.length; b += 1) {
      const band = bands[b];
      const positions = [];
      const colors = [];
      const indices = [];
      const segments = band.segments;
      const baseY = -12;
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * MathUtil.Tau;
        const cx = Math.cos(angle);
        const cz = Math.sin(angle);
        const ridge = MathUtil.Ridge2(cx * 2.6 + b * 7.3, cz * 2.6 - b * 4.1, 4);
        const bump = MathUtil.Fbm2(cx * 5.1 + b * 11, cz * 5.1 - b * 3, 3, 2.1, 0.5);
        const top = baseY + band.height * (0.42 + ridge * 0.72 + bump * 0.22);
        positions.push(cx * band.radius, baseY, cz * band.radius);
        positions.push(cx * band.radius, top, cz * band.radius);
        colorMix.copy(ridgeColor).lerp(fogColor, band.tint);
        colors.push(colorMix.r * 0.82, colorMix.g * 0.82, colorMix.b * 0.82);
        colorTmp.copy(colorMix).lerp(colorSnowLit, 0.30);
        colors.push(colorTmp.r, colorTmp.g, colorTmp.b);
      }
      for (let i = 0; i < segments; i += 1) {
        const a = i * 2; const c = a + 1; const d = a + 2; const e = a + 3;
        indices.push(a, d, c, c, d, e);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'MeshDistantRidge' + b;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = -1;
      group.add(mesh);
      ownedGeometry.push(geometry);
    }
  }
  BuildDistantRidges();

  /* ---------------------------------------------------------------- *
   * 6.4 放置系统：合并批次 + 碰撞体 + 掩体 + 交互物
   * ---------------------------------------------------------------- */

  /* 底色都比 Palette 的原值抬了一档：ACES + 低角度晨光会把 #4a 以下整片吃成黑板。
     真正的暗部交给顶点色的接触阴影和贴图，不靠反照率。 */
  const FamilyColor = {
    Earth: 0x8f7f68, Stone: 0x77797a, Rock: 0x646a71, Timber: 0x7a6a52,
    Charred: 0x554a45, Straw: 0xa8925f, Snow: 0xc9d2dc, Metal: 0x6d5744,
    Cloth: 0x7d7566, Ice: 0xa6bcc8, Leaf: 0x6b6350, Paper: 0xcfc8b6, Ash: 0x6f6a63,
  };
  const FamilySurface = {
    Earth: 'Stone', Stone: 'Stone', Rock: 'Stone', Timber: 'Wood', Charred: 'Wood',
    Straw: 'Straw', Snow: 'Snow', Metal: 'Metal', Cloth: 'Cloth', Ice: 'Ice',
    Leaf: 'Straw', Paper: 'Cloth', Ash: 'Dirt',
  };

  const sectorSize = 66;
  const sectorCols = Math.max(1, Math.ceil(spanX / sectorSize));
  const sectorRows = Math.max(1, Math.ceil(spanZ / sectorSize));
  const batches = new Map();

  /* 只有量大的族才按分区拆批（换来视锥剔除）；零碎族全局一批，省 draw call */
  const SectoredFamilies = { Earth: 1, Stone: 1, Rock: 1, Timber: 1, Straw: 1, Charred: 1 };

  function GetBatch(family, x, z) {
    let sector = 0;
    if (SectoredFamilies[family]) {
      const col = MathUtil.Clamp(Math.floor((x - bounds.minX) / sectorSize), 0, sectorCols - 1);
      const row = MathUtil.Clamp(Math.floor((z - bounds.minZ) / sectorSize), 0, sectorRows - 1);
      sector = row * sectorCols + col;
    }
    const key = family + '#' + sector;
    let batch = batches.get(key);
    if (!batch) { batch = CreateBatch(); batch.family = family; batches.set(key, batch); }
    return batch;
  }

  const styleScratch = {
    color: 0, snowColor: Palette.SnowLit, snow: 0, ao: 1, soot: 0, tone: 1, groundY: 0, uvScale: 0.4,
  };
  const emptyOptions = {};

  function ResolveStyle(family, o, px, pz) {
    const spec = SurfaceFamilies[family];
    styleScratch.color = o.color === undefined ? FamilyColor[family] : o.color;
    styleScratch.snowColor = o.snowColor === undefined ? Palette.SnowLit : o.snowColor;
    styleScratch.snow = o.snow === undefined ? 0.5 : o.snow;
    styleScratch.ao = o.ao === undefined ? 1 : o.ao;
    styleScratch.soot = o.soot === undefined ? 0 : o.soot;
    styleScratch.tone = o.tone === undefined ? (0.88 + random.Next() * 0.24) : o.tone;
    styleScratch.groundY = o.groundY === undefined ? SampleHeight(px, pz) : o.groundY;
    styleScratch.uvScale = o.uvScale === undefined ? spec.uvScale : o.uvScale;
    return styleScratch;
  }

  const pieceMatrix = new THREE.Matrix4();
  const pieceQuaternion = new THREE.Quaternion();
  const pieceEuler = new THREE.Euler();
  const piecePosition = new THREE.Vector3();
  const pieceScale = new THREE.Vector3();

  /** 摆一件静态几何（合并进批次，不产生 draw call）。 */
  function Piece(family, proto, px, py, pz, sx, sy, sz, yaw, opts) {
    const o = opts || emptyOptions;
    pieceEuler.set(o.pitch || 0, yaw || 0, o.roll || 0, 'YXZ');
    pieceQuaternion.setFromEuler(pieceEuler);
    piecePosition.set(px, py, pz);
    pieceScale.set(sx, sy, sz);
    pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
    AppendPiece(GetBatch(family, px, pz), proto, pieceMatrix, ResolveStyle(family, o, px, pz));
  }

  /* —— 碰撞体（带 yaw 的 OBB；sight / sound 分别控制视线与噪音穿透） —— */
  const solids = [];

  function AddSolid(px, py, pz, sx, sy, sz, yaw, opts) {
    const o = opts || emptyOptions;
    const hx = sx * 0.5; const hy = sy * 0.5; const hz = sz * 0.5;
    const cos = Math.cos(yaw || 0);
    const sin = Math.sin(yaw || 0);
    const extentX = Math.abs(hx * cos) + Math.abs(hz * sin);
    const extentZ = Math.abs(hx * sin) + Math.abs(hz * cos);
    const solid = {
      cx: px, cy: py, cz: pz, hx: hx, hy: hy, hz: hz, cos: cos, sin: sin,
      minX: px - extentX, maxX: px + extentX,
      minY: py - hy, maxY: py + hy,
      minZ: pz - extentZ, maxZ: pz + extentZ,
      surface: o.surface || FamilySurface[o.family] || 'Stone',
      kind: o.kind || 'Wall',
      sight: o.sight === undefined ? 1 : o.sight,
      sound: o.sound === undefined ? WorldConfig.occlusionWall : o.sound,
      block: o.block === false ? false : true,
      conceal: o.conceal === undefined ? 0 : o.conceal,
    };
    solids.push(solid);
    return solid;
  }

  /** 摆一件几何并让它挡人。 */
  function Block(family, px, py, pz, sx, sy, sz, yaw, opts) {
    Piece(family, geometryLibrary.box, px, py, pz, sx, sy, sz, yaw, opts);
    const o = opts || emptyOptions;
    return AddSolid(px, py, pz, sx, sy, sz, yaw, {
      surface: o.surface || FamilySurface[family], kind: o.kind, sight: o.sight,
      sound: o.sound, block: o.block, conceal: o.conceal, family: family,
    });
  }

  /* —— 掩体 —— */
  const covers = [];
  const coverLimit = 200;

  function AddCover(x, z, dirX, dirZ, height, kind, width) {
    if (covers.length >= coverLimit) return null;
    const length = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const nx = dirX / length;
    const nz = dirZ / length;
    const standX = x + nx * 0.42;
    const standZ = z + nz * 0.42;
    if (!IsInsideBounds(standX, standZ)) return null;
    const cover = {
      id: 'Cover' + covers.length,
      position: new THREE.Vector3(standX, SampleHeight(standX, standZ), standZ),
      forward: new THREE.Vector3(nx, 0, nz),
      height: height,
      kind: kind || (height > WorldConfig.coverHighHeight ? 'Wall' : 'LowWall'),
      width: width === undefined ? 1.4 : width,
      occupiedBy: null,
      canVault: height <= Config.Player.vaultMaxHeight,
      canPeekLeft: true,
      canPeekRight: true,
    };
    covers.push(cover);
    return cover;
  }

  /** 沿一段墙的两个长面按间隔挂掩体点。 */
  function AddWallCovers(cx, cz, yaw, length, thickness, height, kind) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    /* 墙的长轴是局部 X，法线是局部 Z */
    const normalX = sin;
    const normalZ = cos;
    const stride = 3.0;
    const steps = Math.max(1, Math.floor(length / stride));
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps - 0.5;
      const px = cx + cos * (t * length);
      const pz = cz - sin * (t * length);
      for (let s = -1; s <= 1; s += 2) {
        const ox = px + normalX * (thickness * 0.5 + 0.05) * s;
        const oz = pz + normalZ * (thickness * 0.5 + 0.05) * s;
        AddCover(ox, oz, normalX * s, normalZ * s, height, kind, Math.min(length, stride));
      }
    }
  }

  /** 一圈掩体：草垛、碾盘、大石头这类四面都能靠的东西。 */
  function AddRingCovers(cx, cz, radius, height, kind, count) {
    const total = count || 4;
    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * MathUtil.Tau + 0.4;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      AddCover(cx + dx * radius, cz + dz * radius, dx, dz, height, kind, radius * 1.4);
    }
  }

  /* —— 交互物 —— */
  const interactables = [];
  const interactableIndex = new Map();

  function RegisterInteractable(def) {
    const item = {
      id: def.id || ('Interactable' + interactables.length),
      position: def.position ? def.position.clone() : new THREE.Vector3(),
      kind: def.kind || 'Container',
      label: def.label || '翻找',
      seconds: def.seconds === undefined ? Config.Survival.interactSeconds : def.seconds,
      noiseRadius: def.noiseRadius === undefined ? Config.Stealth.Noise.container : def.noiseRadius,
      state: def.state || 'Idle',
      requiresItem: def.requiresItem === undefined ? null : def.requiresItem,
      companionOnly: !!def.companionOnly,
      tableId: def.tableId === undefined ? null : def.tableId,
    };
    interactables.push(item);
    interactableIndex.set(item.id, item);
    return item;
  }

  function AddInteract(id, kind, label, x, z, y, opts) {
    const o = opts || emptyOptions;
    const item = RegisterInteractable({
      id: id, kind: kind, label: label,
      position: new THREE.Vector3(x, y === undefined ? SampleHeight(x, z) : y, z),
      seconds: o.seconds, noiseRadius: o.noiseRadius, requiresItem: o.requiresItem,
      companionOnly: o.companionOnly, tableId: o.tableId, state: o.state,
    });
    return item;
  }

  /* —— 触发区 / 故事锚点 —— */
  const storyAnchors = {};
  const triggerZones = [];

  function AddAnchor(id, x, z, radius, yaw) {
    storyAnchors[id] = {
      position: new THREE.Vector3(x, SampleHeight(x, z), z),
      yaw: yaw || 0,
      radius: radius === undefined ? 3 : radius,
    };
    return storyAnchors[id];
  }

  function AddZone(id, x, z, radius, kind, payload) {
    triggerZones.push({ id: id, x: x, z: z, radius: radius, kind: kind || 'Zone', payload: payload || {} });
  }

  /* —— 出生点相关的收集器 —— */
  const fireSpots = [];
  const lootSpots = [];
  const enemyPosts = [];
  const patrolRoutes = {};
  const treeInstances = [];
  const pineInstances = [];
  const rockInstances = [];

  /* —— 遮蔽物（草垛 / 灌木 / 雪窝）：给 SampleConcealment 用 —— */
  const concealers = [];
  function AddConcealer(x, z, radius, strength) {
    concealers.push({ x: x, z: z, radius: radius, strength: strength });
  }

  /* —— 房间（IsIndoors / 室内混响 / 光照衰减） —— */
  const rooms = [];
  function AddRoom(cx, cz, halfX, halfZ, yaw, roofed) {
    rooms.push({ cx: cx, cz: cz, hx: halfX, hz: halfZ,
      cos: Math.cos(yaw || 0), sin: Math.sin(yaw || 0), roofed: roofed !== false });
  }

  /* —— 可动交互几何（门板、栏杆）：数量很少，单独出网格换来能开能关 —— */
  const movers = [];
  function AddMover(id, pivotX, pivotY, pivotZ, baseYaw, openYaw, builder) {
    const pivot = new THREE.Group();
    pivot.name = 'MoverPivot_' + id;
    pivot.position.set(pivotX, pivotY, pivotZ);
    pivot.rotation.y = baseYaw;
    const batch = CreateBatch();
    builder(batch);
    const geometry = FinishBatch(batch);
    const material = art.MakeVariant('WoodOld', 'WorldMerged_Timber', { vertexColors: true, color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    ownedGeometry.push(geometry);
    movers.push({ id: id, pivot: pivot, baseYaw: baseYaw, openYaw: openYaw, current: baseYaw, target: baseYaw });
    return pivot;
  }

  function IsInsideBounds(x, z) {
    return x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ;
  }

  /* ---------------------------------------------------------------- *
   * 6.5 建筑构件库 —— 夯土墙 / 石砌房基 / 檩椽屋面 / 塌顶
   * ---------------------------------------------------------------- */

  const box = geometryLibrary.box;
  const cyl6 = geometryLibrary.cyl6;
  const cyl8 = geometryLibrary.cyl8;
  const cyl12 = geometryLibrary.cyl12;
  const cone = geometryLibrary.cone;
  const wedge = geometryLibrary.wedge;
  const quad = geometryLibrary.quad;
  const panel = geometryLibrary.panel;
  const ico = geometryLibrary.ico;
  const icoLow = geometryLibrary.icoLow;
  /* 雪包用球：低模二十面体压扁会露出一块大平顶，看着像掉了张纸 */
  const dome = geometryLibrary.sphere;

  /** 局部坐标 → 世界坐标（绕 Y 轴 yaw）。 */
  function LocalX(cx, yaw, lx, lz) { return cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz; }
  function LocalZ(cz, yaw, lx, lz) { return cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz; }

  /** 沿一段取地面最低点：墙脚要埋进去，不能悬空。 */
  function LowestGround(x1, z1, x2, z2, samples) {
    const total = samples || 5;
    let low = Infinity;
    for (let i = 0; i <= total; i += 1) {
      const t = i / total;
      const value = SampleHeight(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
      if (value < low) low = value;
    }
    return low;
  }

  function FootprintLow(cx, cz, yaw, width, depth) {
    let low = Infinity;
    for (let sx = -1; sx <= 1; sx += 1) {
      for (let sz = -1; sz <= 1; sz += 1) {
        const x = LocalX(cx, yaw, sx * width * 0.5, sz * depth * 0.5);
        const z = LocalZ(cz, yaw, sx * width * 0.5, sz * depth * 0.5);
        const value = SampleHeight(x, z);
        if (value < low) low = value;
      }
    }
    return low;
  }

  /**
   * 一段夯土墙。分层砌，上收下放，层与层之间留缝——远看是体积，近看是夯土的横纹。
   * baseY 是墙脚，height 是露出地面的高度；bury 让墙脚埋进坡里。
   */
  function EarthSegment(px, pz, yaw, length, thickness, baseY, height, bury, opts) {
    if (length <= 0.05 || height <= 0.05) return;
    const o = opts || emptyOptions;
    const family = o.family || 'Earth';
    const total = height + bury;
    const layers = MathUtil.Clamp(Math.round(total / 0.62), 1, 7);
    const layerHeight = total / layers;
    for (let i = 0; i < layers; i += 1) {
      const t = layers > 1 ? i / (layers - 1) : 0;
      const y = baseY - bury + layerHeight * (i + 0.5);
      const inset = t * 0.09 * thickness + (random.Next() - 0.5) * 0.02;
      Piece(family, box, px, y, pz, length * (1 - t * 0.012), layerHeight * 0.985, thickness - inset,
        yaw, {
          color: o.color, snow: i === layers - 1 ? (o.snow === undefined ? 0.62 : o.snow) : 0.18,
          soot: o.soot, groundY: baseY, tone: o.tone, ao: o.ao,
        });
    }
    AddSolid(px, baseY - bury + total * 0.5, pz, length, total, thickness, yaw, {
      surface: FamilySurface[family], kind: o.kind || 'Wall',
      sight: o.sight === undefined ? 1 : o.sight,
      sound: o.sound === undefined ? WorldConfig.occlusionWall : o.sound, family: family,
    });
    if (o.cover !== false) {
      const normalX = Math.sin(yaw);
      const normalZ = Math.cos(yaw);
      const coverKind = o.coverKind || (height > WorldConfig.coverHighHeight ? 'Wall' : 'Ruin');
      const stride = 3.0;
      const steps = Math.max(1, Math.round(length / stride));
      for (let i = 0; i < steps; i += 1) {
        const d = ((i + 0.5) / steps - 0.5) * length;
        const wx = LocalX(px, yaw, d, 0);
        const wz = LocalZ(pz, yaw, d, 0);
        for (let s = -1; s <= 1; s += 2) {
          AddCover(wx + normalX * (thickness * 0.5 + 0.05) * s, wz + normalZ * (thickness * 0.5 + 0.05) * s,
            normalX * s, normalZ * s, height, coverKind, Math.min(length, stride));
        }
      }
    }
  }

  /**
   * 一整面墙，最多带一个开口（门或窗）。开口坐标是墙的局部 X。
   * opening = { center, width, bottom, top }
   */
  function WallPanel(cx, cz, yaw, length, thickness, baseY, height, bury, opening, opts) {
    if (!opening) { EarthSegment(cx, cz, yaw, length, thickness, baseY, height, bury, opts); return; }
    const half = length * 0.5;
    const gapLeft = opening.center - opening.width * 0.5;
    const gapRight = opening.center + opening.width * 0.5;
    const leftLength = gapLeft + half;
    const rightLength = half - gapRight;
    if (leftLength > 0.08) {
      const mid = -half + leftLength * 0.5;
      EarthSegment(LocalX(cx, yaw, mid, 0), LocalZ(cz, yaw, mid, 0), yaw, leftLength, thickness,
        baseY, height, bury, opts);
    }
    if (rightLength > 0.08) {
      const mid = gapRight + rightLength * 0.5;
      EarthSegment(LocalX(cx, yaw, mid, 0), LocalZ(cz, yaw, mid, 0), yaw, rightLength, thickness,
        baseY, height, bury, opts);
    }
    const px = LocalX(cx, yaw, opening.center, 0);
    const pz = LocalZ(cz, yaw, opening.center, 0);
    if (opening.bottom > 0.05) {
      EarthSegment(px, pz, yaw, opening.width, thickness, baseY, opening.bottom, bury,
        Object.assign({ cover: false }, opts));
    }
    if (opening.top < height - 0.05) {
      const lintelHeight = height - opening.top;
      /* 过梁：一根木头压在门窗上口，是华北民居最好认的一笔 */
      Piece('Timber', box, px, baseY + opening.top + 0.09, pz,
        opening.width + 0.42, 0.18, thickness + 0.06, yaw, { snow: 0.2, groundY: baseY });
      EarthSegment(px, pz, yaw, opening.width, thickness, baseY + opening.top + 0.18, lintelHeight - 0.18, 0,
        Object.assign({ cover: false }, opts));
    }
    /* 门框 / 窗框 */
    for (let s = -1; s <= 1; s += 2) {
      const fx = LocalX(cx, yaw, opening.center + s * (opening.width * 0.5 + 0.05), 0);
      const fz = LocalZ(cz, yaw, opening.center + s * (opening.width * 0.5 + 0.05), 0);
      const frameHeight = opening.top - opening.bottom;
      Piece('Timber', box, fx, baseY + opening.bottom + frameHeight * 0.5, fz,
        0.12, frameHeight, thickness + 0.05, yaw, { snow: 0.12, groundY: baseY });
    }
  }

  /** 窗棂 + 破窗纸：一格一格的木条，纸只剩几片挂着。 */
  function WindowLattice(px, py, pz, yaw, width, height) {
    const bars = Math.max(2, Math.round(width / 0.26));
    for (let i = 1; i < bars; i += 1) {
      const d = (i / bars - 0.5) * width;
      Piece('Timber', box, LocalX(px, yaw, d, 0), py, LocalZ(pz, yaw, d, 0), 0.035, height, 0.035, yaw,
        { snow: 0.1, groundY: py - height });
    }
    const rows = Math.max(2, Math.round(height / 0.26));
    for (let i = 1; i < rows; i += 1) {
      const y = py - height * 0.5 + (i / rows) * height;
      Piece('Timber', box, px, y, pz, width, 0.035, 0.035, yaw, { snow: 0.1, groundY: py - height });
    }
    /* 剩下的窗纸：只挂上半截，下半截被风撕走了 */
    if (random.Chance(0.7)) {
      Piece('Paper', panel, px, py + height * 0.22, pz, width * 0.94, height * (0.3 + random.Next() * 0.28), 1,
        yaw, { snow: 0, ao: 0.4, groundY: py - height });
    }
  }

  /**
   * 双坡硬山屋面：檩 + 椽 + 苫背。出檐要够，屋脊要压住——轮廓一出来就不是盒子了。
   */
  function GableRoof(cx, cz, yaw, width, depth, wallTop, opts) {
    const o = opts || emptyOptions;
    const rise = o.rise === undefined ? depth * 0.26 : o.rise;
    const overhang = o.overhang === undefined ? 0.55 : o.overhang;
    const ridgeY = wallTop + rise;
    const slopeLength = Math.sqrt((depth * 0.5 + overhang) * (depth * 0.5 + overhang) + rise * rise);
    const pitch = Math.atan2(rise, depth * 0.5 + overhang);
    const roofFamily = o.family || 'Straw';
    for (let s = -1; s <= 1; s += 2) {
      const midZ = s * (depth * 0.25 + overhang * 0.5);
      const midY = wallTop + rise * 0.5 - 0.02;
      const px = LocalX(cx, yaw, 0, midZ);
      const pz = LocalZ(cz, yaw, 0, midZ);
      /* 檩条（顺着屋脊方向）——先摆结构，再盖苫背 */
      for (let r = 0; r < 3; r += 1) {
        const rt = (r + 0.5) / 3;
        const lz = s * (rt * (depth * 0.5 + overhang));
        const ly = wallTop + rise * (1 - rt) - 0.06;
        Piece('Timber', cyl6, LocalX(cx, yaw, 0, lz), ly, LocalZ(cz, yaw, 0, lz),
          0.13, width + overhang * 1.2, 0.13, yaw, { pitch: 0, roll: Math.PI / 2, snow: 0.1, groundY: wallTop - 2 });
      }
      /* 椽子：从屋脊挑到檐口，端头露出来 */
      const rafters = Math.max(4, Math.round(width / 0.62));
      for (let i = 0; i <= rafters; i += 1) {
        const lx = (i / rafters - 0.5) * (width + overhang * 1.1);
        Piece('Timber', box,
          LocalX(cx, yaw, lx, midZ), midY, LocalZ(cz, yaw, lx, midZ),
          0.075, 0.075, slopeLength, yaw,
          { pitch: s * pitch, snow: 0.2, groundY: wallTop - 2, tone: 0.9 + random.Next() * 0.2 });
      }
      /* 苫背（草泥背 / 瓦）：一块带厚度的斜板，压在椽子上 */
      Piece(roofFamily, box, px, midY + 0.1, pz,
        width + overhang * 1.1, 0.17, slopeLength, yaw,
        { pitch: s * pitch, snow: o.snow === undefined ? 0.86 : o.snow, groundY: wallTop - 2,
          color: o.color, soot: o.soot });
    }
    /* 屋脊 */
    Piece('Stone', box, cx, ridgeY + 0.08, cz, width + 0.2, 0.17, 0.30, yaw,
      { snow: 0.9, groundY: wallTop - 2 });
    /* 硬山：两端山墙填成三角 */
    for (let s = -1; s <= 1; s += 2) {
      const gx = LocalX(cx, yaw, s * width * 0.5, 0);
      const gz = LocalZ(cz, yaw, s * width * 0.5, 0);
      for (let half = -1; half <= 1; half += 2) {
        const hz = half * depth * 0.25;
        Piece('Earth', wedge,
          LocalX(gx, yaw, 0, hz), wallTop, LocalZ(gz, yaw, 0, hz),
          0.30, rise * 0.5, depth * 0.5, yaw + (half > 0 ? 0 : Math.PI),
          { snow: 0.3, groundY: wallTop - 2, soot: o.soot, roll: 0, pitch: 0 });
      }
    }
    AddSolid(cx, ridgeY - rise * 0.4, cz, width + overhang, rise * 1.2, depth + overhang * 2, yaw,
      { surface: 'Wood', kind: 'Roof', sight: 1, sound: 0.6, family: 'Straw' });
    return ridgeY;
  }

  /** 塌了的屋顶：椽子掉进屋里，梁烧成炭斜插着，屋里堆一摊瓦砾。 */
  function CollapsedRoof(cx, cz, yaw, width, depth, wallTop, groundY) {
    const count = 4 + random.Int(0, 4);
    for (let i = 0; i < count; i += 1) {
      const lx = (random.Next() - 0.5) * width * 0.9;
      const lz = (random.Next() - 0.5) * depth * 0.8;
      const length = depth * (0.55 + random.Next() * 0.5);
      const tilt = 0.55 + random.Next() * 0.75;
      const spin = (random.Next() - 0.5) * 1.4;
      Piece('Charred', box,
        LocalX(cx, yaw, lx, lz), groundY + Math.cos(tilt) * length * 0.5 + 0.1, LocalZ(cz, yaw, lx, lz),
        0.16, 0.16, length, yaw + spin,
        { pitch: tilt, snow: 0.42, groundY: groundY, soot: 0.55 });
    }
    /* 檐口只剩一小截还搭在墙头上——比全塌更有「刚刚发生过」的味道 */
    if (random.Chance(0.75)) {
      const side = random.Chance(0.5) ? 1 : -1;
      const lz = side * depth * 0.34;
      Piece('Charred', box, LocalX(cx, yaw, 0, lz), wallTop - 0.25, LocalZ(cz, yaw, 0, lz),
        width * (0.35 + random.Next() * 0.3), 0.16, depth * 0.42, yaw,
        { pitch: side * 0.62, snow: 0.55, groundY: groundY, soot: 0.5 });
    }
    /* 瓦砾堆 */
    for (let i = 0; i < 5; i += 1) {
      const lx = (random.Next() - 0.5) * width * 0.75;
      const lz = (random.Next() - 0.5) * depth * 0.7;
      const size = 0.5 + random.Next() * 0.9;
      Piece('Earth', icoLow, LocalX(cx, yaw, lx, lz), groundY + size * 0.16, LocalZ(cz, yaw, lx, lz),
        size * 1.7, size * 0.6, size * 1.5, random.Next() * MathUtil.Tau,
        { snow: 0.6, soot: 0.35, groundY: groundY, color: 0x7d6f5e });
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.6 生活痕迹 —— 被战争打断的那一层
   * ---------------------------------------------------------------- */

  /** 缸：粮缸 / 水缸。破的那口会把粮食洒出来。 */
  function Jar(x, z, scale, broken, opts) {
    const o = opts || emptyOptions;
    const groundY = SampleHeight(x, z);
    const height = 0.62 * scale;
    const radius = 0.34 * scale;
    const tilt = broken ? 0.35 + random.Next() * 0.5 : 0;
    const spin = random.Next() * MathUtil.Tau;
    Piece('Earth', cyl12, x, groundY + height * 0.45, z, radius * 2, height, radius * 2, spin,
      { pitch: tilt, color: 0x6f6355, snow: broken ? 0.2 : 0.72, groundY: groundY });
    Piece('Earth', cyl12, x, groundY + height * 0.92, z, radius * 2.2, height * 0.12, radius * 2.2, spin,
      { pitch: tilt, color: 0x6a5f52, snow: broken ? 0.2 : 0.8, groundY: groundY });
    if (broken) {
      /* 洒出来的粮食：一小摊，不多。够说明那天早上有人正在装粮。 */
      const dx = Math.sin(spin) * radius * 1.5;
      const dz = Math.cos(spin) * radius * 1.5;
      Piece('Straw', ico, x + dx, groundY + 0.05, z + dz, 0.95 * scale, 0.14, 0.8 * scale, spin,
        { color: 0xa8945f, snow: 0.35, groundY: groundY });
      for (let i = 0; i < 3; i += 1) {
        const a = random.Next() * MathUtil.Tau;
        const r = radius * (1.2 + random.Next() * 1.6);
        Piece('Earth', icoLow, x + Math.cos(a) * r, groundY + 0.04, z + Math.sin(a) * r,
          0.18, 0.06, 0.15, random.Next() * MathUtil.Tau, { color: 0x6f6355, snow: 0.4, groundY: groundY });
      }
    } else {
      AddSolid(x, groundY + height * 0.5, z, radius * 2, height, radius * 2, 0,
        { surface: 'Stone', kind: 'Jar', sight: 0.7, sound: 0.2 });
    }
    if (o.loot) {
      AddInteract(o.loot, 'Container', broken ? '扒开碎缸' : '翻缸底', x, z, groundY + height * 0.7,
        { tableId: 'TableVillage', noiseRadius: Config.Stealth.Noise.container });
    }
  }

  /** 门板：从门框上卸下来的，斜靠着或者干脆平躺在雪里。 */
  function DoorLeaf(x, z, yaw, fallen) {
    const groundY = SampleHeight(x, z);
    if (fallen) {
      Piece('Timber', box, x, groundY + 0.07, z, 0.92, 0.09, 1.86, yaw,
        { snow: 0.78, groundY: groundY, color: 0x6d5f4b });
      for (let i = 0; i < 3; i += 1) {
        Piece('Timber', box, x, groundY + 0.13, z, 0.94, 0.03, 0.10, yaw,
          { snow: 0.7, groundY: groundY, color: 0x60543f });
      }
    } else {
      Piece('Timber', box, LocalX(x, yaw, 0, 0.24), groundY + 0.9, LocalZ(z, yaw, 0, 0.24),
        0.9, 1.82, 0.08, yaw, { pitch: 0.22, snow: 0.24, groundY: groundY, color: 0x6d5f4b });
      AddSolid(x, groundY + 0.9, z, 0.9, 1.8, 0.3, yaw, { surface: 'Wood', kind: 'Door', sight: 0.9, sound: 0.5 });
    }
  }

  /** 门口的鞋、没收拾完的碗、翻倒的板凳——克制，不解释，看到就懂。 */
  function LifeDetails(x, z, yaw, flavour) {
    const groundY = SampleHeight(x, z);
    if (flavour === 'Shoes' || flavour === undefined) {
      /* 一双小孩的棉鞋，摆得整整齐齐，鞋尖朝里 */
      for (let s = -1; s <= 1; s += 2) {
        Piece('Cloth', box, LocalX(x, yaw, s * 0.10, 0), groundY + 0.05, LocalZ(z, yaw, s * 0.10, 0),
          0.11, 0.09, 0.24, yaw + s * 0.08, { color: 0x4d4034, snow: 0.55, ao: 1.2, groundY: groundY });
      }
    }
    if (flavour === 'Bowls') {
      for (let i = 0; i < 3; i += 1) {
        const a = random.Next() * MathUtil.Tau;
        const r = 0.1 + random.Next() * 0.45;
        const tipped = i === 2;
        Piece('Paper', cyl8, x + Math.cos(a) * r, groundY + 0.045, z + Math.sin(a) * r,
          0.17, 0.08, 0.17, a, { pitch: tipped ? 1.4 : 0, color: 0xb9b2a2, snow: 0.5, groundY: groundY });
      }
    }
    if (flavour === 'Bucket') {
      Piece('Timber', cyl8, x, groundY + 0.16, z, 0.34, 0.32, 0.34, yaw,
        { pitch: 1.25, color: 0x6d5f4b, snow: 0.4, groundY: groundY });
      Piece('Ice', cyl8, x + 0.18, groundY + 0.03, z, 0.4, 0.05, 0.36, yaw,
        { snow: 0.2, ao: 0.5, groundY: groundY });
    }
    if (flavour === 'Toy') {
      /* 一个拨浪鼓，柄折了。只此一件，多了就滥情。 */
      Piece('Timber', cyl6, x, groundY + 0.06, z, 0.11, 0.05, 0.11, yaw,
        { color: 0x7a6242, snow: 0.3, groundY: groundY });
      Piece('Timber', box, x + 0.09, groundY + 0.035, z + 0.04, 0.025, 0.025, 0.16, yaw + 0.7,
        { color: 0x6b563a, snow: 0.3, groundY: groundY });
    }
  }

  /** 晾衣绳：两根杆一条绳，冻硬的衣服直挺挺挂着，风也吹不动。 */
  function Clothesline(x, z, yaw, length) {
    const groundY = LowestGround(LocalX(x, yaw, -length / 2, 0), LocalZ(z, yaw, -length / 2, 0),
      LocalX(x, yaw, length / 2, 0), LocalZ(z, yaw, length / 2, 0), 4);
    for (let s = -1; s <= 1; s += 2) {
      const px = LocalX(x, yaw, s * length * 0.5, 0);
      const pz = LocalZ(z, yaw, s * length * 0.5, 0);
      Piece('Timber', cyl6, px, groundY + 1.0, pz, 0.11, 2.1, 0.11, yaw,
        { pitch: s * 0.05, snow: 0.3, groundY: groundY });
      AddSolid(px, groundY + 1.0, pz, 0.24, 2.0, 0.24, 0, { surface: 'Wood', kind: 'Pole', sight: 0.15, sound: 0.05 });
    }
    Piece('Timber', box, x, groundY + 1.92, z, length, 0.025, 0.025, yaw, { snow: 0.5, groundY: groundY });
    const cloths = 2 + random.Int(0, 2);
    for (let i = 0; i < cloths; i += 1) {
      const d = (random.Next() - 0.5) * length * 0.75;
      const width = 0.4 + random.Next() * 0.35;
      const drop = 0.5 + random.Next() * 0.45;
      Piece('Cloth', panel, LocalX(x, yaw, d, 0), groundY + 1.9 - drop * 0.5, LocalZ(z, yaw, d, 0),
        width, drop, 1, yaw + (random.Next() - 0.5) * 0.12,
        { color: random.Chance(0.5) ? 0x59616b : 0x6f6656, snow: 0.15, ao: 0.5, groundY: groundY });
    }
  }

  /** 草垛：潜行的命根子。既是掩体，也是遮蔽，也是能钻进去的地方。 */
  function Haystack(x, z, scale) {
    const groundY = SampleHeight(x, z);
    const radius = (1.05 + random.Next() * 0.5) * (scale || 1);
    const height = (1.55 + random.Next() * 0.55) * (scale || 1);
    const spin = random.Next() * MathUtil.Tau;
    Piece('Straw', cyl8, x, groundY + height * 0.34, z, radius * 2, height * 0.68, radius * 2, spin,
      { snow: 0.3, groundY: groundY, color: 0x9d8a58 });
    Piece('Straw', cone, x, groundY + height * 0.82, z, radius * 2.25, height * 0.62, radius * 2.25, spin + 0.4,
      { snow: 0.82, groundY: groundY, color: 0xa2905e });
    /* 压顶的木杆，防风刮走 */
    Piece('Timber', cyl6, x, groundY + height * 1.02, z, 0.07, radius * 2.6, 0.07, spin + 0.9,
      { roll: Math.PI / 2, pitch: 0.25, snow: 0.5, groundY: groundY });
    AddSolid(x, groundY + height * 0.5, z, radius * 1.85, height, radius * 1.85, 0,
      { surface: 'Straw', kind: 'Haystack', sight: 0.95, sound: 0.45, conceal: 0.75 });
    AddRingCovers(x, z, radius + 0.35, Math.min(height, 1.5), 'Haystack', 4);
    AddConcealer(x, z, radius + 1.5, 0.55);
  }

  /** 柴垛：码得整整齐齐的劈柴，人还在过日子的证据。 */
  function Woodpile(x, z, yaw, length) {
    const groundY = LowestGround(LocalX(x, yaw, -length / 2, 0), LocalZ(z, yaw, -length / 2, 0),
      LocalX(x, yaw, length / 2, 0), LocalZ(z, yaw, length / 2, 0), 4);
    const rows = 4;
    const perRow = Math.max(3, Math.round(length / 0.24));
    for (let r = 0; r < rows; r += 1) {
      const y = groundY + 0.13 + r * 0.23;
      const shrink = 1 - r * 0.06;
      for (let i = 0; i < perRow; i += 1) {
        const d = ((i + 0.5) / perRow - 0.5) * length * shrink;
        Piece('Timber', cyl6, LocalX(x, yaw, d, 0), y, LocalZ(z, yaw, d, 0),
          0.2, 0.62, 0.2, yaw + (random.Next() - 0.5) * 0.15,
          { roll: Math.PI / 2, snow: r === rows - 1 ? 0.75 : 0.15, groundY: groundY,
            color: 0x7c6a4f, tone: 0.85 + random.Next() * 0.3 });
      }
    }
    AddSolid(x, groundY + 0.5, z, length, 1.0, 0.72, yaw,
      { surface: 'Wood', kind: 'Woodpile', sight: 0.9, sound: 0.4, conceal: 0.35 });
    AddWallCovers(x, z, yaw, length, 0.72, 0.95, 'Crate');
    AddConcealer(x, z, length * 0.5 + 0.8, 0.3);
  }

  /** 篱笆：秫秸夹的，歪歪扭扭，挡不住人但挡视线不多——巷子的边界感。 */
  function Fence(x1, z1, x2, z2, opts) {
    const o = opts || emptyOptions;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.4) return;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const posts = Math.max(2, Math.round(length / 1.5));
    for (let i = 0; i <= posts; i += 1) {
      const t = i / posts;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const groundY = SampleHeight(px, pz);
      const height = 1.15 + random.Next() * 0.3;
      if (o.gap && random.Chance(0.18)) continue;
      Piece('Timber', cyl6, px, groundY + height * 0.5, pz, 0.1, height, 0.1,
        random.Next() * MathUtil.Tau, { pitch: (random.Next() - 0.5) * 0.14, snow: 0.35, groundY: groundY });
    }
    /* 横向的秫秸片 */
    const panels = Math.max(1, Math.round(length / 0.9));
    for (let i = 0; i < panels; i += 1) {
      const t = (i + 0.5) / panels;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const groundY = SampleHeight(px, pz);
      if (o.gap && random.Chance(0.2)) continue;
      Piece('Straw', box, px, groundY + 0.62, pz, length / panels * 0.98, 1.05, 0.07,
        yaw, { pitch: 0, roll: (random.Next() - 0.5) * 0.08, snow: 0.3, groundY: groundY, color: 0x94824f });
    }
    AddSolid((x1 + x2) * 0.5, SampleHeight((x1 + x2) * 0.5, (z1 + z2) * 0.5) + 0.6, (z1 + z2) * 0.5,
      length, 1.2, 0.2, yaw, { surface: 'Wood', kind: 'Fence', sight: 0.25, sound: 0.08 });
  }

  /** 碾盘：村子的中心。石头做的，谁也搬不走，所以还在。 */
  function Millstone(x, z) {
    const groundY = SampleHeight(x, z);
    Piece('Stone', cyl12, x, groundY + 0.14, z, 2.5, 0.28, 2.5, 0, { snow: 0.55, groundY: groundY });
    Piece('Stone', cyl12, x, groundY + 0.32, z, 2.15, 0.14, 2.15, 0, { snow: 0.8, groundY: groundY });
    const spin = random.Next() * MathUtil.Tau;
    Piece('Stone', cyl12, LocalX(x, spin, 0.6, 0), groundY + 0.66, LocalZ(z, spin, 0.6, 0),
      0.66, 0.72, 0.66, spin, { roll: Math.PI / 2, snow: 0.6, groundY: groundY });
    Piece('Timber', box, x, groundY + 0.72, z, 1.9, 0.09, 0.09, spin, { snow: 0.5, groundY: groundY });
    AddSolid(x, groundY + 0.3, z, 2.5, 0.6, 2.5, 0,
      { surface: 'Stone', kind: 'Millstone', sight: 0.35, sound: 0.3 });
    AddRingCovers(x, z, 1.6, 0.7, 'Rock', 4);
    PaintSurface(x, z, 3.2, 1);
  }

  /** 水井：石头砌的井台 + 辘轳。井绳还挂着，桶冻在半空。 */
  function Well(x, z) {
    const groundY = SampleHeight(x, z);
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * MathUtil.Tau;
      Piece('Stone', box, x + Math.cos(a) * 0.66, groundY + 0.28, z + Math.sin(a) * 0.66,
        0.46, 0.56, 0.3, -a, { snow: 0.6, groundY: groundY, tone: 0.86 + random.Next() * 0.28 });
    }
    Piece('Rock', cyl12, x, groundY - 0.4, z, 1.05, 0.9, 1.05, 0, { color: 0x2a2f35, snow: 0, ao: 1.4, groundY: groundY });
    for (let s = -1; s <= 1; s += 2) {
      Piece('Timber', cyl6, x + s * 0.72, groundY + 0.95, z, 0.13, 1.9, 0.13, 0,
        { snow: 0.3, groundY: groundY });
    }
    Piece('Timber', cyl8, x, groundY + 1.82, z, 0.24, 1.5, 0.24, 0,
      { roll: Math.PI / 2, snow: 0.45, groundY: groundY });
    Piece('Timber', box, x, groundY + 1.35, z, 0.03, 0.9, 0.03, 0, { snow: 0.1, groundY: groundY });
    Piece('Timber', cyl8, x, groundY + 0.82, z, 0.26, 0.3, 0.26, 0.5, { snow: 0.4, groundY: groundY });
    AddSolid(x, groundY + 0.3, z, 1.7, 0.7, 1.7, 0, { surface: 'Stone', kind: 'Well', sight: 0.3, sound: 0.2 });
    AddRingCovers(x, z, 1.25, 0.62, 'Rock', 4);
    return groundY;
  }

  /** 翻倒的独轮车：逃难时推不动了，就扔在路边。 */
  function Barrow(x, z, yaw) {
    const groundY = SampleHeight(x, z);
    const roll = 1.15 + random.Next() * 0.35;
    Piece('Timber', box, x, groundY + 0.34, z, 1.15, 0.42, 0.62, yaw, { roll: roll, snow: 0.45, groundY: groundY });
    Piece('Timber', cyl8, LocalX(x, yaw, 0, -0.12), groundY + 0.44, LocalZ(z, yaw, 0, -0.12),
      0.72, 0.1, 0.72, yaw, { pitch: 0.4, snow: 0.3, groundY: groundY, color: 0x6a5b46 });
    for (let s = -1; s <= 1; s += 2) {
      Piece('Timber', box, LocalX(x, yaw, s * 0.86, 0.2), groundY + 0.5, LocalZ(z, yaw, s * 0.86, 0.2),
        0.08, 0.08, 1.0, yaw, { pitch: 0.5, snow: 0.4, groundY: groundY });
    }
    AddSolid(x, groundY + 0.35, z, 1.5, 0.8, 1.0, yaw,
      { surface: 'Wood', kind: 'Cart', sight: 0.75, sound: 0.25, conceal: 0.3 });
    AddRingCovers(x, z, 1.0, 0.85, 'Cart', 3);
  }

  /** 火堆 / 余烬：全片唯一的暖色，也是唯一不用箭头的路标。 */
  function Firepit(x, z, opts) {
    const o = opts || emptyOptions;
    const groundY = SampleHeight(x, z);
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * MathUtil.Tau + random.Next() * 0.3;
      Piece('Rock', icoLow, x + Math.cos(a) * 0.55, groundY + 0.09, z + Math.sin(a) * 0.55,
        0.34, 0.24, 0.3, a, { snow: 0.2, groundY: groundY, color: 0x585d63 });
    }
    Piece('Ash', quad, x, groundY + 0.02, z, 1.5, 1, 1.5, 0, { color: 0x4a453f, snow: 0, ao: 1.3, groundY: groundY });
    for (let i = 0; i < 4; i += 1) {
      const a = random.Next() * MathUtil.Tau;
      Piece('Charred', box, x + Math.cos(a) * 0.2, groundY + 0.09, z + Math.sin(a) * 0.2,
        0.09, 0.09, 0.75, a, { pitch: 0.25, snow: 0.05, soot: 0.8, groundY: groundY });
    }
    PaintSurface(x, z, 1.8, 1);
    if (o.lit !== false && art && art.CreateFireLight) {
      const handle = art.CreateFireLight(new THREE.Vector3(x, groundY + 0.35, z),
        { radius: o.radius === undefined ? 9 : o.radius, intensity: o.intensity === undefined ? 3.4 : o.intensity,
          flicker: 0.34 });
      if (handle) lightHandles.push(handle);
    }
    fireSpots.push(new THREE.Vector3(x, groundY, z));
    if (o.interact !== false) {
      AddInteract(o.id || ('InteractableFire' + fireSpots.length), 'Fire', '烤火', x, z, groundY + 0.2,
        { seconds: 1.0, noiseRadius: 2 });
    }
    return groundY;
  }

  /** 冒烟的废墟：不给光，只给一缕烟。烟是「几个小时前这里还在烧」的唯一证据。 */
  const smolderSpots = [];
  function Smolder(x, z, strength) {
    const groundY = SampleHeight(x, z);
    Piece('Ash', quad, x, groundY + 0.02, z, 3.4, 1, 3.0, random.Next() * MathUtil.Tau,
      { color: 0x403b36, snow: 0, ao: 1.4, groundY: groundY });
    for (let i = 0; i < 5; i += 1) {
      const a = random.Next() * MathUtil.Tau;
      const r = random.Next() * 1.3;
      Piece('Charred', icoLow, x + Math.cos(a) * r, groundY + 0.1, z + Math.sin(a) * r,
        0.5, 0.24, 0.45, a, { soot: 0.7, snow: 0.12, groundY: groundY });
    }
    smolderSpots.push({ x: x, y: groundY + 0.4, z: z, strength: strength === undefined ? 1 : strength, timer: random.Next() * 2 });
  }

  /* ---------------------------------------------------------------- *
   * 6.7 房子：石砌房基 + 夯土墙 + 檩椽屋面 + 院墙 + 炕灶
   * ---------------------------------------------------------------- */

  /**
   * 一间正房。门开在局部 +Z 面（yaw 决定朝向）。
   * opts: burnt 烧过 / floors 层数 / doorId 门交互 / lootId 灶膛 / roofFamily
   */
  function House(cx, cz, yaw, width, depth, wallHeight, opts) {
    const o = opts || emptyOptions;
    const burnt = !!o.burnt;
    const low = FootprintLow(cx, cz, yaw, width, depth);
    const plinthHeight = 0.42;
    const baseY = low + plinthHeight;
    const bury = 1.1;

    /* 石砌房基：华北民居最下面永远是石头，这一层把房子「钉」在坡上 */
    Piece('Stone', box, cx, low + plinthHeight * 0.5 - 0.55, cz,
      width + 0.5, plinthHeight + 1.1, depth + 0.5, yaw,
      { snow: 0.25, groundY: low, color: 0x6e7072 });
    for (let i = 0; i < 12; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const along = ((Math.floor(i / 2) + 0.5) / 6 - 0.5);
      const useX = i < 6;
      const lx = useX ? along * width : side * width * 0.5;
      const lz = useX ? side * depth * 0.5 : along * depth;
      Piece('Stone', icoLow, LocalX(cx, yaw, lx, lz), low + 0.14 + random.Next() * 0.2, LocalZ(cz, yaw, lx, lz),
        0.5 + random.Next() * 0.4, 0.34, 0.42, random.Next() * MathUtil.Tau,
        { snow: 0.4, groundY: low, color: 0x74767a });
    }

    const doorWidth = 1.05;
    const windowWidth = 1.0;
    const missingWall = burnt ? random.Int(0, 4) : -1;
    const wallOpts = { color: burnt ? 0x7a6a5c : undefined, soot: burnt ? 0.55 : 0 };

    /* 四面墙：0 = 前（开门）1 = 后 2 = 左 3 = 右 */
    for (let side = 0; side < 4; side += 1) {
      const isFront = side === 0;
      const isBack = side === 1;
      const alongX = side < 2;
      const length = alongX ? width : depth;
      const offset = alongX ? depth * 0.5 : width * 0.5;
      const lx = alongX ? 0 : (side === 2 ? -offset : offset);
      const lz = alongX ? (isFront ? offset : -offset) : 0;
      const wallYaw = yaw + (alongX ? 0 : Math.PI / 2);
      const px = LocalX(cx, yaw, lx, lz);
      const pz = LocalZ(cz, yaw, lx, lz);
      let height = wallHeight;
      if (side === missingWall) height = wallHeight * (0.28 + random.Next() * 0.24);
      else if (burnt) height = wallHeight * (0.74 + random.Next() * 0.26);
      let opening = null;
      if (isFront && height > 2.1) opening = { center: 0, width: doorWidth, bottom: 0, top: 1.95 };
      else if (isBack && height > 2.0 && random.Chance(0.6)) {
        opening = { center: (random.Next() - 0.5) * width * 0.4, width: windowWidth, bottom: 0.95, top: 1.72 };
      } else if (!alongX && height > 2.0 && random.Chance(0.5)) {
        opening = { center: (random.Next() - 0.5) * depth * 0.4, width: windowWidth, bottom: 0.95, top: 1.72 };
      }
      WallPanel(px, pz, wallYaw, length, 0.44, baseY, height, bury, opening,
        Object.assign({ coverKind: side === missingWall ? 'Ruin' : 'Wall' }, wallOpts));
      if (opening && opening.bottom > 0.5) {
        WindowLattice(LocalX(px, wallYaw, opening.center, 0),
          baseY + (opening.bottom + opening.top) * 0.5,
          LocalZ(pz, wallYaw, opening.center, 0), wallYaw, opening.width - 0.1, opening.top - opening.bottom);
      }
      if (isFront && opening) {
        /* 门口的一级石阶 */
        const stepX = LocalX(px, wallYaw, 0, 0.42);
        const stepZ = LocalZ(pz, wallYaw, 0, 0.42);
        Piece('Stone', box, stepX, baseY + 0.06, stepZ, doorWidth + 0.6, 0.24, 0.7, wallYaw,
          { snow: 0.68, groundY: low });
        if (o.doorId) {
          AddInteract(o.doorId, 'Door', o.doorLabel || '推门', stepX, stepZ, baseY + 1.0,
            { seconds: 1.2, noiseRadius: Config.Stealth.Noise.doorOpen });
        }
        if (random.Chance(0.55)) DoorLeaf(stepX + (random.Next() - 0.5) * 1.1, stepZ + 0.6 + random.Next() * 0.7,
          wallYaw + random.Next(), true);
        if (random.Chance(0.4)) LifeDetails(LocalX(px, wallYaw, 0.55, 0.5), LocalZ(pz, wallYaw, 0.55, 0.5),
          wallYaw, 'Shoes');
      }
    }

    const wallTop = baseY + wallHeight;
    if (burnt) {
      CollapsedRoof(cx, cz, yaw, width - 0.6, depth - 0.6, wallTop, baseY);
      Smolder(LocalX(cx, yaw, (random.Next() - 0.5) * width * 0.4, (random.Next() - 0.5) * depth * 0.4),
        LocalZ(cz, yaw, (random.Next() - 0.5) * width * 0.4, (random.Next() - 0.5) * depth * 0.4),
        0.7 + random.Next() * 0.5);
    } else {
      GableRoof(cx, cz, yaw, width + 0.16, depth + 0.16, wallTop,
        { family: o.roofFamily || 'Straw', rise: depth * 0.27, overhang: 0.6 });
      /* 烟囱 */
      const chx = LocalX(cx, yaw, width * 0.28, -depth * 0.3);
      const chz = LocalZ(cz, yaw, width * 0.28, -depth * 0.3);
      Piece('Earth', box, chx, wallTop + 0.62, chz, 0.44, 1.5, 0.44, yaw,
        { snow: 0.55, groundY: low, soot: 0.4 });
    }

    /* 屋里：炕 + 灶。屋顶塌了也看得见，正因为看得见才难受。 */
    const kangX = LocalX(cx, yaw, -width * 0.22, -depth * 0.24);
    const kangZ = LocalZ(cz, yaw, -width * 0.22, -depth * 0.24);
    Piece('Earth', box, kangX, baseY + 0.28, kangZ, width * 0.5, 0.56, depth * 0.42, yaw,
      { snow: burnt ? 0.35 : 0.05, groundY: baseY, soot: burnt ? 0.4 : 0, color: 0x83745f });
    AddSolid(kangX, baseY + 0.28, kangZ, width * 0.5, 0.56, depth * 0.42, yaw,
      { surface: 'Stone', kind: 'Kang', sight: 0.3, sound: 0.2 });
    const stoveX = LocalX(cx, yaw, width * 0.28, -depth * 0.26);
    const stoveZ = LocalZ(cz, yaw, width * 0.28, -depth * 0.26);
    Piece('Earth', cyl8, stoveX, baseY + 0.34, stoveZ, 0.92, 0.68, 0.92, yaw,
      { snow: burnt ? 0.3 : 0.02, groundY: baseY, soot: 0.55, color: 0x7d6f5c });
    if (o.lootId) {
      AddInteract(o.lootId, 'Container', '掏灶膛', stoveX, stoveZ, baseY + 0.6,
        { tableId: 'TableVillage', noiseRadius: Config.Stealth.Noise.container });
      lootSpots.push({ id: o.lootId, position: new THREE.Vector3(stoveX, baseY, stoveZ),
        container: 'Stove', tableId: 'TableVillage' });
    }
    if (random.Chance(0.6)) LifeDetails(LocalX(cx, yaw, -width * 0.22, -depth * 0.02),
      LocalZ(cz, yaw, -width * 0.22, -depth * 0.02), yaw, 'Bowls');

    AddRoom(cx, cz, width * 0.5, depth * 0.5, yaw, !burnt);
    buildings.push({ x: cx, z: cz, yaw: yaw, width: width, depth: depth, burnt: burnt, groundY: low, top: wallTop });
    return { baseY: baseY, low: low, wallTop: wallTop };
  }

  const buildings = [];

  /** 院墙：夯土的，把村子夹成一条条巷子。潜行的骨架就是它。 */
  function CourtyardWall(cx, cz, yaw, width, depth, opts) {
    const o = opts || emptyOptions;
    const height = o.height === undefined ? 1.85 : o.height;
    const sides = [
      { lx: 0, lz: depth * 0.5, length: width, rot: 0 },
      { lx: 0, lz: -depth * 0.5, length: width, rot: 0 },
      { lx: -width * 0.5, lz: 0, length: depth, rot: Math.PI / 2 },
      { lx: width * 0.5, lz: 0, length: depth, rot: Math.PI / 2 },
    ];
    const gateSide = o.gateSide === undefined ? 0 : o.gateSide;
    for (let i = 0; i < sides.length; i += 1) {
      const side = sides[i];
      const px = LocalX(cx, yaw, side.lx, side.lz);
      const pz = LocalZ(cz, yaw, side.lx, side.lz);
      const wallYaw = yaw + side.rot;
      const groundY = LowestGround(LocalX(px, wallYaw, -side.length / 2, 0), LocalZ(pz, wallYaw, -side.length / 2, 0),
        LocalX(px, wallYaw, side.length / 2, 0), LocalZ(pz, wallYaw, side.length / 2, 0), 5);
      let opening = null;
      if (i === gateSide) opening = { center: 0, width: 1.5, bottom: 0, top: height };
      const broken = o.broken && random.Chance(0.45);
      WallPanel(px, pz, wallYaw, side.length, 0.36, groundY, broken ? height * 0.42 : height, 0.9,
        opening, { coverKind: broken ? 'Ruin' : 'Wall', color: 0x8a7a63 });
      if (i === gateSide) {
        /* 门楼：两根柱子顶一小片瓦，是院子的脸 */
        for (let s = -1; s <= 1; s += 2) {
          Piece('Timber', cyl8, LocalX(px, wallYaw, s * 0.82, 0), groundY + height * 0.5,
            LocalZ(pz, wallYaw, s * 0.82, 0), 0.2, height + 0.3, 0.2, wallYaw,
            { snow: 0.3, groundY: groundY });
        }
        Piece('Stone', box, px, groundY + height + 0.28, pz, 2.3, 0.18, 1.15, wallYaw,
          { snow: 0.85, groundY: groundY });
        Piece('Timber', box, px, groundY + height + 0.12, pz, 2.0, 0.16, 0.9, wallYaw,
          { snow: 0.2, groundY: groundY });
      }
      /* 狗洞：墙根一个方口，只有小孩和狗钻得过去 */
      if (o.dogHoleSide === i) {
        const holeX = LocalX(px, wallYaw, side.length * 0.24, 0);
        const holeZ = LocalZ(pz, wallYaw, side.length * 0.24, 0);
        Piece('Timber', box, holeX, groundY + 0.52, holeZ, 0.72, 0.1, 0.44, wallYaw,
          { snow: 0.2, groundY: groundY });
        AddInteract(o.dogHoleId || 'InteractableDogHole', 'DogHole', '让小满钻过去',
          LocalX(holeX, wallYaw, 0, 0.7), LocalZ(holeZ, wallYaw, 0, 0.7), groundY + 0.4,
          { seconds: Config.Companion.squeezeSeconds, companionOnly: true, noiseRadius: 2 });
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.8 地标构件
   * ---------------------------------------------------------------- */

  /** 村口牌坊：石柱夹木枋，顶上一层瓦。烧了一半，还立着。 */
  function GateArch(x, z, yaw) {
    const groundY = LowestGround(LocalX(x, yaw, -3.6, 0), LocalZ(z, yaw, -3.6, 0),
      LocalX(x, yaw, 3.6, 0), LocalZ(z, yaw, 3.6, 0), 7);
    for (let s = -1; s <= 1; s += 2) {
      const px = LocalX(x, yaw, s * 3.3, 0);
      const pz = LocalZ(z, yaw, s * 3.3, 0);
      Piece('Stone', box, px, groundY + 2.6, pz, 0.68, 6.2, 0.68, yaw,
        { snow: 0.35, groundY: groundY, soot: s < 0 ? 0.45 : 0.1 });
      Piece('Stone', box, px, groundY + 0.2, pz, 1.0, 0.5, 1.0, yaw, { snow: 0.5, groundY: groundY });
      AddSolid(px, groundY + 2.6, pz, 0.8, 6.2, 0.8, yaw, { surface: 'Stone', kind: 'Pillar', sight: 0.8, sound: 0.6 });
      AddCover(px + Math.sin(yaw) * 0.5, pz + Math.cos(yaw) * 0.5, Math.sin(yaw), Math.cos(yaw), 1.7, 'Wall', 0.8);
    }
    Piece('Timber', box, x, groundY + 4.55, z, 7.4, 0.46, 0.52, yaw, { snow: 0.5, groundY: groundY, soot: 0.3 });
    Piece('Timber', box, x, groundY + 5.15, z, 6.8, 0.30, 0.44, yaw, { snow: 0.5, groundY: groundY, soot: 0.35 });
    /* 顶上的瓦檐：断了一角 */
    Piece('Stone', box, LocalX(x, yaw, -0.5, 0), groundY + 5.55, LocalZ(z, yaw, -0.5, 0),
      6.4, 0.24, 1.2, yaw, { pitch: 0.06, snow: 0.9, groundY: groundY });
    Piece('Stone', box, LocalX(x, yaw, 3.9, 1.1), groundY + 0.35, LocalZ(z, yaw, 3.9, 1.1),
      1.3, 0.24, 0.9, yaw + 0.6, { pitch: 0.15, snow: 0.7, groundY: groundY });
    /* 匾额：字看不清了 */
    /* 匾额吊在下枋底下，字早看不清了 */
    for (let s = -1; s <= 1; s += 2) {
      Piece('Timber', box, LocalX(x, yaw, s * 0.9, 0), groundY + 4.18, LocalZ(z, yaw, s * 0.9, 0),
        0.05, 0.34, 0.05, yaw, { snow: 0.1, groundY: groundY });
    }
    Piece('Timber', box, x, groundY + 3.66, z, 2.2, 0.72, 0.16, yaw,
      { snow: 0.2, groundY: groundY, color: 0x5f5241, soot: 0.3 });
    PaintSurface(x, z, 4.0, 1);
    return groundY;
  }

  /** 窑洞：在土崖上掏出来的拱门。华北山村最省料的住法。 */
  function CaveDwelling(x, z, yaw, width) {
    const groundY = SampleHeight(x, z);
    const w = width || 2.4;
    /* 崖面 */
    Piece('Earth', box, LocalX(x, yaw, 0, -1.2), groundY + 2.0, LocalZ(z, yaw, 0, -1.2),
      w + 3.2, 4.2, 2.6, yaw, { snow: 0.4, groundY: groundY, color: 0x877862 });
    AddSolid(LocalX(x, yaw, 0, -1.4), groundY + 2.0, LocalZ(z, yaw, 0, -1.4), w + 3.2, 4.2, 3.0, yaw,
      { surface: 'Stone', kind: 'Cliff', sight: 1, sound: 0.9 });
    /* 拱券：用小块石头砌一圈 */
    const arcCount = 9;
    for (let i = 0; i <= arcCount; i += 1) {
      const a = Math.PI * (i / arcCount);
      const lx = -Math.cos(a) * w * 0.5;
      const ly = Math.sin(a) * w * 0.5;
      Piece('Stone', box, LocalX(x, yaw, lx, 0.1), groundY + 1.15 + ly, LocalZ(z, yaw, lx, 0.1),
        0.42, 0.34, 0.5, yaw + a, { snow: 0.3, groundY: groundY, color: 0x74767a });
    }
    for (let s = -1; s <= 1; s += 2) {
      Piece('Stone', box, LocalX(x, yaw, s * w * 0.5, 0.1), groundY + 0.6, LocalZ(z, yaw, s * w * 0.5, 0.1),
        0.42, 1.2, 0.5, yaw, { snow: 0.2, groundY: groundY, color: 0x74767a });
    }
    /* 洞里：黑的，但不是纯黑——留一点内壁的形 */
    Piece('Earth', box, LocalX(x, yaw, 0, -0.9), groundY + 1.0, LocalZ(z, yaw, 0, -0.9),
      w - 0.2, 2.0, 1.6, yaw, { color: 0x3b342c, snow: 0, ao: 1.5, groundY: groundY });
    AddRoom(LocalX(x, yaw, 0, -0.9), LocalZ(z, yaw, 0, -0.9), w * 0.5, 0.9, yaw, true);
    AddConcealer(LocalX(x, yaw, 0, -0.6), LocalZ(z, yaw, 0, -0.6), 1.8, 0.6);
    return groundY;
  }

  /** 梯田挡墙：扫描高度场里的坎，坎上垒石头。地形长什么样，墙就砌在哪儿。 */
  function BuildTerraceWalls(minX, maxX, minZ, maxZ) {
    const step = 3.4;
    for (let z = minZ; z < maxZ; z += step) {
      for (let x = minX; x < maxX; x += step) {
        const h0 = SampleHeight(x, z);
        const h1 = SampleHeight(x - step, z);
        const drop = h0 - h1;
        if (drop < 0.85 || drop > 2.6) continue;
        if (SampleLane(x, z) > 0.2) continue;
        if (QueryRoute(route, x, z).lateral < 11) continue;
        if (random.Chance(0.28)) continue;
        const wallHeight = drop + 0.3;
        const length = step * (0.9 + random.Next() * 0.35);
        const px = x - step * 0.5;
        const rows = MathUtil.Clamp(Math.round(wallHeight / 0.52), 2, 4);
        for (let i = 0; i < rows; i += 1) {
          const t = (i + 0.5) / rows;
          const stones = 2 + random.Int(0, 2);
          for (let k = 0; k < stones; k += 1) {
            const along = ((k + 0.5) / stones - 0.5) * length;
            Piece('Stone', icoLow, px + (random.Next() - 0.5) * 0.14,
              h1 + wallHeight * t - 0.12, z + along + (random.Next() - 0.5) * 0.18,
              0.52 + random.Next() * 0.2, wallHeight / rows * 1.25, length / stones * (0.9 + random.Next() * 0.4),
              (random.Next() - 0.5) * 0.6,
              { snow: i === rows - 1 ? 0.62 : 0.16, groundY: h1, color: 0x69696b,
                tone: 0.78 + random.Next() * 0.42 });
          }
        }
        AddSolid(px, h1 + wallHeight * 0.5, z, 0.6, wallHeight, length, Math.PI / 2,
          { surface: 'Stone', kind: 'Terrace', sight: 1, sound: 0.7 });
        if (random.Chance(0.35)) {
          AddCover(px + 0.5, z, 1, 0, Math.min(wallHeight, 1.6), 'LowWall', length);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.9 实例化植被与岩石（一棵树 = 一整套枝干，烘进原型几何）
   * ---------------------------------------------------------------- */

  function BuildProtoGeometry(build) {
    const batch = CreateBatch();
    build(function (proto, px, py, pz, sx, sy, sz, yaw, opts) {
      const o = opts || emptyOptions;
      pieceEuler.set(o.pitch || 0, yaw || 0, o.roll || 0, 'YXZ');
      pieceQuaternion.setFromEuler(pieceEuler);
      piecePosition.set(px, py, pz);
      pieceScale.set(sx, sy, sz);
      pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
      styleScratch.color = o.color === undefined ? 0xffffff : o.color;
      styleScratch.snowColor = Palette.SnowLit;
      styleScratch.snow = o.snow === undefined ? 0.4 : o.snow;
      styleScratch.ao = o.ao === undefined ? 1 : o.ao;
      styleScratch.soot = 0;
      styleScratch.tone = o.tone === undefined ? 1 : o.tone;
      styleScratch.groundY = 0;
      styleScratch.uvScale = o.uvScale === undefined ? 0.5 : o.uvScale;
      AppendPiece(batch, proto, pieceMatrix, styleScratch);
    });
    const geometry = FinishBatch(batch);
    ownedGeometry.push(geometry);
    return geometry;
  }

  /* 冬天的落叶树：没有叶子，只有骨头一样的枝。剪影全靠它。 */
  const bareTreeGeometry = BuildProtoGeometry((put) => {
    put(geometryLibrary.taper, 0, 0.30, 0, 0.19, 0.62, 0.19, 0, { color: 0x6d5f4a, snow: 0.14 });
    const branches = 7;
    for (let i = 0; i < branches; i += 1) {
      const angle = (i / branches) * MathUtil.Tau + MathUtil.Hash1(i * 3.3) * 0.9;
      const start = 0.40 + MathUtil.Hash1(i * 5.1) * 0.20;
      const length = 0.30 + MathUtil.Hash1(i * 7.7) * 0.26;
      const tilt = 0.62 + MathUtil.Hash1(i * 9.9) * 0.42;
      const mx = Math.sin(angle) * Math.sin(tilt) * length * 0.5;
      const mz = Math.cos(angle) * Math.sin(tilt) * length * 0.5;
      put(cyl6, mx, start + Math.cos(tilt) * length * 0.5, mz, 0.062, length, 0.062, angle,
        { pitch: tilt, color: 0x6a5c47, snow: 0.34 });
      for (let k = 0; k < 2; k += 1) {
        const twist = angle + (k === 0 ? 0.6 : -0.6);
        const tipX = Math.sin(angle) * Math.sin(tilt) * length;
        const tipZ = Math.cos(angle) * Math.sin(tilt) * length;
        const tipY = start + Math.cos(tilt) * length;
        const sub = length * 0.55;
        put(cyl6, tipX + Math.sin(twist) * sub * 0.3, tipY + sub * 0.34, tipZ + Math.cos(twist) * sub * 0.3,
          0.038, sub, 0.038, twist, { pitch: 0.75, color: 0x67593f, snow: 0.4 });
      }
    }
  });

  const pineTrunkGeometry = BuildProtoGeometry((put) => {
    put(geometryLibrary.taper, 0, 0.4, 0, 0.13, 0.82, 0.13, 0, { color: 0x5f4f3c, snow: 0.1 });
  });
  const pineCanopyGeometry = BuildProtoGeometry((put) => {
    /* 五层，层层压住下面一层的口，不露黑底盖；雪只沾一点，不然就是圣诞树 */
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      const radius = 0.50 - t * 0.34;
      put(geometryLibrary.coneOpen, (MathUtil.Hash1(i * 4.1) - 0.5) * 0.05, 0.34 + t * 0.42,
        (MathUtil.Hash1(i * 8.3) - 0.5) * 0.05,
        radius * 2, 0.30 - t * 0.09, radius * 1.85, i * 0.9,
        { pitch: (MathUtil.Hash1(i * 2.3) - 0.5) * 0.10, color: 0x39422f, snow: 0.20 });
    }
    put(geometryLibrary.cone6, 0, 0.82, 0, 0.16, 0.24, 0.16, 0.4, { color: 0x39422f, snow: 0.28 });
  });

  const rockGeometries = [];
  for (let variant = 0; variant < 3; variant += 1) {
    rockGeometries.push(BuildProtoGeometry((put) => {
      const lumps = 3 + variant;
      for (let i = 0; i < lumps; i += 1) {
        const a = MathUtil.Hash1(variant * 17 + i * 3.7) * MathUtil.Tau;
        const r = MathUtil.Hash1(variant * 23 + i * 5.3) * 0.22;
        put(icoLow, Math.cos(a) * r, 0.16 + MathUtil.Hash1(i * 7.1 + variant) * 0.18, Math.sin(a) * r,
          0.6 + MathUtil.Hash1(i * 11.3) * 0.4, 0.42 + MathUtil.Hash1(i * 13.7) * 0.34,
          0.55 + MathUtil.Hash1(i * 19.1) * 0.4, a,
          { color: 0x646a71, snow: 0.72, tone: 0.9 + MathUtil.Hash1(i * 2.1) * 0.2 });
      }
    }));
  }

  function PlantTree(x, z, height, pine) {
    const groundY = GroundUnder(x, z, 0.55) - 0.12;
    const list = pine ? pineInstances : treeInstances;
    list.push({ x: x, y: groundY, z: z, height: height, yaw: random.Next() * MathUtil.Tau,
      lean: (random.Next() - 0.5) * 0.14, tone: 0.84 + random.Next() * 0.32 });
    AddSolid(x, groundY + height * 0.45, z, 0.34 * (height / 6 + 0.6), height * 0.9, 0.34 * (height / 6 + 0.6), 0,
      { surface: 'Wood', kind: 'Tree', sight: pine ? 0.55 : 0.2, sound: 0.12, conceal: pine ? 0.35 : 0.08 });
    if (pine) AddConcealer(x, z, 1.8, 0.3);
  }

  function ScatterRock(x, z, scale, cover) {
    const groundY = GroundUnder(x, z, scale * 0.55);
    rockInstances.push({ x: x, y: groundY - scale * 0.24, z: z, scale: scale,
      yaw: random.Next() * MathUtil.Tau, squash: 0.7 + random.Next() * 0.6,
      variant: random.Int(0, rockGeometries.length), tone: 0.86 + random.Next() * 0.28 });
    const height = scale * 0.62;
    AddSolid(x, groundY + height * 0.42, z, scale * 0.95, height, scale * 0.9, 0,
      { surface: 'Stone', kind: 'Rock', sight: height > 1.0 ? 1 : 0.7, sound: 0.55, conceal: 0.15 });
    if (cover && height > 0.6) AddRingCovers(x, z, scale * 0.6 + 0.35, Math.min(height, 1.6), 'Rock', 3);
  }

  function FinishInstances() {
    const created = [];
    function Emit(name, geometry, materialKey, list, sizer) {
      if (list.length === 0) return;
      const material = art.MakeVariant(materialKey, 'WorldInstanced_' + materialKey,
        { vertexColors: true, color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        sizer(item, pieceScale);
        pieceEuler.set(item.lean || 0, item.yaw, 0, 'YXZ');
        pieceQuaternion.setFromEuler(pieceEuler);
        piecePosition.set(item.x, item.y, item.z);
        pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
        mesh.setMatrixAt(i, pieceMatrix);
        batchColor.setRGB(item.tone, item.tone, item.tone);
        mesh.setColorAt(i, batchColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      created.push(mesh);
    }
    Emit('InstancedBareTree', bareTreeGeometry, 'WoodOld', treeInstances,
      (item, out) => out.set(item.height * 0.55, item.height, item.height * 0.55));
    Emit('InstancedPineTrunk', pineTrunkGeometry, 'WoodOld', pineInstances,
      (item, out) => out.set(item.height * 0.30, item.height, item.height * 0.30));
    Emit('InstancedPineCanopy', pineCanopyGeometry, 'Foliage', pineInstances,
      (item, out) => out.set(item.height * 0.40, item.height, item.height * 0.40));
    for (let v = 0; v < rockGeometries.length; v += 1) {
      const subset = rockInstances.filter((item) => item.variant === v);
      Emit('InstancedRock' + v, rockGeometries[v], 'Rock', subset,
        (item, out) => out.set(item.scale, item.scale * item.squash, item.scale));
    }
    return created;
  }

  /* ---------------------------------------------------------------- *
   * 6.10 第二幕 / 第三幕的地标构件
   * ---------------------------------------------------------------- */

  /** 碉堡：八边形石堡，射孔黑洞洞地朝着公路。整个断谷都在它眼皮底下。 */
  function Pillbox(x, z, yaw) {
    const groundY = FootprintLow(x, z, 0, 7.5, 7.5);
    const radius = 3.1;
    const height = 4.4;
    Piece('Stone', cyl8, x, groundY + 0.35, z, radius * 2.5, 1.5, radius * 2.5, yaw,
      { snow: 0.4, groundY: groundY, color: 0x6d6f70 });
    for (let ring = 0; ring < 5; ring += 1) {
      const y = groundY + 0.9 + ring * (height / 5);
      const shrink = 1 - ring * 0.028;
      for (let i = 0; i < 8; i += 1) {
        const a = yaw + (i / 8) * MathUtil.Tau;
        const embrasure = (i === 0 || i === 3 || i === 5) && (ring === 2 || ring === 3);
        Piece(embrasure ? 'Rock' : 'Stone', box,
          x + Math.sin(a) * radius * shrink, y, z + Math.cos(a) * radius * shrink,
          radius * 0.86, height / 5 * 0.98, 0.62, a,
          { snow: ring === 4 ? 0.6 : 0.16, groundY: groundY,
            color: embrasure ? 0x2f3439 : 0x6d6f70, ao: embrasure ? 1.5 : 1,
            tone: 0.88 + random.Next() * 0.22 });
      }
      AddSolid(x, y, z, radius * 2, height / 5, radius * 2, yaw,
        { surface: 'Stone', kind: 'Bunker', sight: 1, sound: 0.95 });
    }
    Piece('Stone', cyl8, x, groundY + height + 1.1, z, radius * 2.35, 0.42, radius * 2.35, yaw,
      { snow: 0.88, groundY: groundY, color: 0x74767a });
    /* 堡门朝后 */
    Piece('Metal', box, LocalX(x, yaw, 0, -radius - 0.2), groundY + 1.9, LocalZ(z, yaw, 0, -radius - 0.2),
      1.0, 1.9, 0.16, yaw, { snow: 0.2, groundY: groundY });
    /* 一圈沙袋 */
    for (let i = 0; i < 14; i += 1) {
      const a = yaw + 0.2 + (i / 14) * MathUtil.Tau;
      Sandbag(x + Math.sin(a) * (radius + 1.5), z + Math.cos(a) * (radius + 1.5), a, 2);
    }
    AddRoom(x, z, radius * 0.7, radius * 0.7, yaw, true);
    AddRingCovers(x, z, radius + 2.4, 1.1, 'Sandbag', 6);
    return groundY + height;
  }

  /** 沙袋垛。 */
  function Sandbag(x, z, yaw, rows) {
    const groundY = SampleHeight(x, z);
    const total = rows || 3;
    for (let r = 0; r < total; r += 1) {
      const y = groundY + 0.15 + r * 0.28;
      const shift = (r % 2) * 0.22;
      for (let i = -1; i <= 1; i += 1) {
        Piece('Cloth', icoLow, LocalX(x, yaw, i * 0.5 + shift, 0), y, LocalZ(z, yaw, i * 0.5 + shift, 0),
          0.58, 0.3, 0.42, yaw + (random.Next() - 0.5) * 0.2,
          { color: 0x7a7159, snow: r === total - 1 ? 0.6 : 0.1, groundY: groundY,
            tone: 0.86 + random.Next() * 0.28 });
      }
    }
    const height = 0.15 + total * 0.28;
    AddSolid(x, groundY + height * 0.5, z, 1.7, height, 0.62, yaw,
      { surface: 'Cloth', kind: 'Sandbag', sight: height > 1.0 ? 0.9 : 0.6, sound: 0.5, conceal: 0.2 });
    AddWallCovers(x, z, yaw, 1.7, 0.62, height, 'Sandbag');
  }

  /** 铁丝网：X 形木架拉三道刺线。挡不住视线，但挡路——潜行要绕。 */
  function BarbedWire(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.5) return;
    const yaw = Math.atan2(dx, dz) - Math.PI / 2;
    const frames = Math.max(2, Math.round(length / 2.4));
    for (let i = 0; i <= frames; i += 1) {
      const t = i / frames;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const groundY = SampleHeight(px, pz);
      for (let s = -1; s <= 1; s += 2) {
        Piece('Timber', box, px, groundY + 0.6, pz, 0.09, 1.5, 0.09, yaw,
          { pitch: 0, roll: s * 0.55, snow: 0.3, groundY: groundY });
      }
    }
    for (let w = 0; w < 3; w += 1) {
      const y = 0.35 + w * 0.42;
      const segments = Math.max(2, Math.round(length / 3));
      for (let i = 0; i < segments; i += 1) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const mx = x1 + dx * (t0 + t1) * 0.5;
        const mz = z1 + dz * (t0 + t1) * 0.5;
        const groundY = SampleHeight(mx, mz);
        Piece('Metal', box, mx, groundY + y, mz, 0.028, 0.028, length / segments, yaw,
          { color: 0x545049, snow: 0.4, ao: 0.4, groundY: groundY });
      }
    }
    AddSolid((x1 + x2) * 0.5, SampleHeight((x1 + x2) * 0.5, (z1 + z2) * 0.5) + 0.7, (z1 + z2) * 0.5,
      length, 1.4, 0.7, yaw, { surface: 'Metal', kind: 'Wire', sight: 0.06, sound: 0.02 });
  }

  /** 断桥：两头的桥台还在，中间一跨没了。桥板掉在沟底。 */
  function BrokenBridge(x, z, yaw, spanLength) {
    const deckY = SampleHeight(LocalX(x, yaw, 0, spanLength * 0.62), LocalZ(z, yaw, 0, spanLength * 0.62)) + 0.6;
    for (let s = -1; s <= 1; s += 2) {
      const lz = s * spanLength * 0.36;
      const px = LocalX(x, yaw, 0, lz);
      const pz = LocalZ(z, yaw, 0, lz);
      const groundY = SampleHeight(px, pz);
      /* 桥台 */
      Piece('Stone', box, px, (groundY + deckY) * 0.5 - 0.4, pz, 6.4, deckY - groundY + 1.4, spanLength * 0.32, yaw,
        { snow: 0.3, groundY: groundY, color: 0x6f7174 });
      AddSolid(px, (groundY + deckY) * 0.5 - 0.4, pz, 6.4, deckY - groundY + 1.4, spanLength * 0.32, yaw,
        { surface: 'Stone', kind: 'Bridge', sight: 1, sound: 0.9 });
      /* 桥面 + 断口的碎茬 */
      Piece('Stone', box, px, deckY + 0.1, pz, 6.6, 0.34, spanLength * 0.32, yaw,
        { snow: 0.8, groundY: groundY });
      for (let i = 0; i < 4; i += 1) {
        const lx = (i / 3 - 0.5) * 5.4;
        Piece('Stone', box, LocalX(px, yaw, lx, -s * spanLength * 0.17), deckY + 0.06,
          LocalZ(pz, yaw, lx, -s * spanLength * 0.17),
          1.1, 0.3, 0.5 + random.Next() * 0.7, yaw + (random.Next() - 0.5) * 0.3,
          { snow: 0.5, groundY: groundY, tone: 0.85 + random.Next() * 0.3 });
      }
      /* 桥栏：断成几截 */
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i += 1) {
          if (random.Chance(0.3)) continue;
          const lx = side * 3.0;
          const lo = (i / 2 - 0.5) * spanLength * 0.26;
          Piece('Stone', box, LocalX(px, yaw, lx, lo), deckY + 0.55, LocalZ(pz, yaw, lx, lo),
            0.4, 0.7, spanLength * 0.09, yaw, { snow: 0.7, groundY: groundY });
        }
      }
      AddWallCovers(px, pz, yaw, 6.4, 0.6, 1.1, 'Ruin');
    }
    /* 掉进沟底的桥板 */
    for (let i = 0; i < 5; i += 1) {
      const lx = (random.Next() - 0.5) * 6;
      const lz = (random.Next() - 0.5) * spanLength * 0.3;
      const px = LocalX(x, yaw, lx, lz);
      const pz = LocalZ(z, yaw, lx, lz);
      const groundY = SampleHeight(px, pz);
      Piece('Stone', box, px, groundY + 0.22, pz, 1.6 + random.Next(), 0.4, 1.1 + random.Next(),
        random.Next() * MathUtil.Tau, { pitch: (random.Next() - 0.5) * 0.5, snow: 0.55, groundY: groundY });
      AddSolid(px, groundY + 0.2, pz, 1.8, 0.5, 1.4, 0, { surface: 'Stone', kind: 'Rubble', sight: 0.5, sound: 0.4 });
    }
  }

  /** 电线杆：沿公路一路排过去，是「这条路通向什么地方」的视觉引导。 */
  function TelegraphLine(points) {
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const groundY = SampleHeight(p.x, p.z);
      Piece('Timber', cyl6, p.x, groundY + 3.4, p.z, 0.26, 7.0, 0.26, random.Next(),
        { pitch: (random.Next() - 0.5) * 0.06, snow: 0.2, groundY: groundY, color: 0x5f5341 });
      Piece('Timber', box, p.x, groundY + 6.3, p.z, 1.5, 0.12, 0.12, p.yaw || 0,
        { snow: 0.5, groundY: groundY });
      AddSolid(p.x, groundY + 3.4, p.z, 0.4, 6.8, 0.4, 0,
        { surface: 'Wood', kind: 'Pole', sight: 0.2, sound: 0.1 });
      if (i > 0) {
        const q = points[i - 1];
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const yaw = Math.atan2(dx, dz) - Math.PI / 2;
        const midY = (SampleHeight(p.x, p.z) + SampleHeight(q.x, q.z)) * 0.5 + 5.9;
        for (let s = -1; s <= 1; s += 2) {
          Piece('Metal', box, (p.x + q.x) * 0.5, midY, (p.z + q.z) * 0.5,
            0.03, 0.03, length, yaw, { color: 0x4a4640, snow: 0.2, ao: 0.3, groundY: midY - 6 });
        }
      }
    }
  }

  /** 探照灯塔：木架子搭的，上面一盏灯。第三幕的悬顶之剑。 */
  function SearchTower(x, z, yaw, height) {
    const groundY = FootprintLow(x, z, 0, 3.4, 3.4);
    const legSpread = 1.5;
    for (let i = 0; i < 4; i += 1) {
      const sx = (i % 2 === 0 ? -1 : 1) * legSpread;
      const sz = (i < 2 ? -1 : 1) * legSpread;
      Piece('Timber', box, LocalX(x, yaw, sx * 0.82, sz * 0.82), groundY + height * 0.5,
        LocalZ(z, yaw, sx * 0.82, sz * 0.82), 0.22, height, 0.22, yaw,
        { pitch: sz * 0.055, roll: -sx * 0.055, snow: 0.2, groundY: groundY });
      AddSolid(LocalX(x, yaw, sx * 0.9, sz * 0.9), groundY + height * 0.5, LocalZ(z, yaw, sx * 0.9, sz * 0.9),
        0.3, height, 0.3, yaw, { surface: 'Wood', kind: 'Pole', sight: 0.25, sound: 0.1 });
    }
    for (let level = 1; level <= 3; level += 1) {
      const y = groundY + (level / 4) * height;
      for (let s = 0; s < 4; s += 1) {
        const a = yaw + s * Math.PI / 2;
        Piece('Timber', box, LocalX(x, a, 0, 1.4), y, LocalZ(z, a, 0, 1.4), 2.9, 0.12, 0.12, a,
          { snow: 0.3, groundY: groundY });
        Piece('Timber', box, LocalX(x, a, 0, 1.4), y - height * 0.125, LocalZ(z, a, 0, 1.4),
          3.3, 0.09, 0.09, a, { roll: 0.62, snow: 0.2, groundY: groundY });
      }
    }
    const platformY = groundY + height;
    Piece('Timber', box, x, platformY, z, 3.4, 0.18, 3.4, yaw, { snow: 0.6, groundY: groundY });
    for (let s = 0; s < 4; s += 1) {
      const a = yaw + s * Math.PI / 2;
      Piece('Timber', box, LocalX(x, a, 0, 1.6), platformY + 0.5, LocalZ(z, a, 0, 1.6), 3.4, 0.1, 0.1, a,
        { snow: 0.4, groundY: groundY });
    }
    Piece('Metal', cyl12, x, platformY + 0.95, z, 1.0, 0.9, 1.0, yaw + 0.5,
      { roll: Math.PI / 2, pitch: 0.2, color: 0x5c5a56, snow: 0.3, groundY: groundY });
    Piece('Timber', box, x, platformY + 0.35, z, 0.4, 0.5, 0.4, yaw, { snow: 0.2, groundY: groundY });
    AddSolid(x, groundY + height * 0.5, z, 3.2, height, 3.2, yaw,
      { surface: 'Wood', kind: 'Tower', sight: 0.3, sound: 0.15, block: false });
    AddInteract('InteractableTowerLadder', 'Ladder', '爬上灯塔',
      LocalX(x, yaw, 0, 1.7), LocalZ(z, yaw, 0, 1.7), groundY, { seconds: 2.0, noiseRadius: 3 });
    return platformY;
  }

  /** 岩脊：一簇棱角石头从雪里拱出来，脚下堆一圈风吹起的雪。山上的「地形」全靠它。 */
  function RockOutcrop(x, z, scale, tall) {
    const groundY = GroundUnder(x, z, scale * 0.9);
    const lumps = 3 + random.Int(0, 3);
    let peak = 0;
    for (let i = 0; i < lumps; i += 1) {
      const a = random.Next() * MathUtil.Tau;
      const r = random.Next() * scale * 0.55;
      const width = scale * (0.6 + random.Next() * 0.7);
      const height = scale * (tall ? 0.9 + random.Next() * 1.1 : 0.45 + random.Next() * 0.5);
      if (height > peak) peak = height;
      Piece('Rock', icoLow, x + Math.cos(a) * r, groundY + height * 0.08, z + Math.sin(a) * r,
        width, height, width * (0.7 + random.Next() * 0.6), a,
        { pitch: (random.Next() - 0.5) * 0.3, snow: 0.62, groundY: groundY,
          color: 0x5c626a, tone: 0.86 + random.Next() * 0.3 });
    }
    AddSolid(x, groundY + peak * 0.35, z, scale * 1.5, peak, scale * 1.4, 0,
      { surface: 'Stone', kind: 'Rock', sight: peak > 1.2 ? 1 : 0.6, sound: 0.6, conceal: 0.2 });
    if (peak > 0.8) AddRingCovers(x, z, scale * 0.85, Math.min(peak, 1.6), 'Rock', 3);
    for (let i = 0; i < 2; i += 1) {
      const a = Math.atan2(-windX, -windZ) + (random.Next() - 0.5) * 0.8;
      const lump = scale * (0.5 + random.Next() * 0.4);
      const px = x + Math.sin(a) * scale * 0.9;
      const pz = z + Math.cos(a) * scale * 0.9;
      Piece('Snow', dome, px, GroundUnder(px, pz, lump) - lump * 0.55, pz,
        lump * 2.2, lump * 1.5, lump * 2.8, a, { snow: 0.45, color: Palette.SnowMid, ao: 0.55, groundY: groundY });
    }
    AddConcealer(x, z, scale * 1.6, 0.28);
  }

  /** 倒木：被雪压断的松，横在坡上。既是掩体也是路标。 */
  function Deadfall(x, z, yaw, length) {
    const groundY = GroundUnder(x, z, length * 0.4);
    Piece('Timber', geometryLibrary.taper, x, groundY + 0.3, z, 0.46, length, 0.46, yaw,
      { roll: Math.PI / 2, pitch: (random.Next() - 0.5) * 0.16, snow: 0.66, groundY: groundY,
        color: 0x5f5341 });
    for (let i = 0; i < 4; i += 1) {
      const d = ((i + 0.5) / 4 - 0.5) * length * 0.8;
      const px = LocalX(x, yaw, d, 0);
      const pz = LocalZ(z, yaw, d, 0);
      Piece('Timber', cyl6, px, groundY + 0.55, pz, 0.09, 0.9 + random.Next() * 0.7, 0.09,
        yaw + (random.Next() - 0.5) * 2, { pitch: 0.9 + random.Next() * 0.5, snow: 0.5, groundY: groundY });
    }
    const stumpX = LocalX(x, yaw, -length * 0.55, 0);
    const stumpZ = LocalZ(z, yaw, -length * 0.55, 0);
    Piece('Timber', geometryLibrary.taper, stumpX, GroundUnder(stumpX, stumpZ, 0.5) + 0.4, stumpZ,
      0.62, 0.9, 0.62, yaw, { snow: 0.7, groundY: groundY, color: 0x584c3b });
    AddSolid(x, groundY + 0.32, z, length, 0.6, 0.55, yaw,
      { surface: 'Wood', kind: 'Log', sight: 0.35, sound: 0.2, conceal: 0.25 });
    AddWallCovers(x, z, yaw, length, 0.6, 0.72, 'Ruin');
  }

  /** 山道路杆：一根歪脖子木桩绑一块布。赶脚的人靠它在雪里找路。 */
  function PathMarker(x, z) {
    const groundY = GroundUnder(x, z, 0.4);
    Piece('Timber', cyl6, x, groundY + 0.85, z, 0.13, 1.8, 0.13, random.Next(),
      { pitch: (random.Next() - 0.5) * 0.3, snow: 0.4, groundY: groundY, color: 0x5f5341 });
    Piece('Cloth', panel, x + 0.08, groundY + 1.45, z, 0.26, 0.42, 1, random.Next() * MathUtil.Tau,
      { color: 0x6d6656, snow: 0.2, ao: 0.5, groundY: groundY });
    AddSolid(x, groundY + 0.85, z, 0.3, 1.8, 0.3, 0, { surface: 'Wood', kind: 'Pole', sight: 0.1, sound: 0.05 });
  }

  /** 石堆：山里给赶路人指路的记号。不用箭头，用这个。 */
  function Cairn(x, z) {
    const groundY = SampleHeight(x, z);
    let y = groundY;
    const stones = 4 + random.Int(0, 3);
    for (let i = 0; i < stones; i += 1) {
      const size = 0.7 - i * 0.075;
      Piece('Rock', icoLow, x + (random.Next() - 0.5) * 0.12, y + size * 0.2, z + (random.Next() - 0.5) * 0.12,
        size, size * 0.5, size * 0.9, random.Next() * MathUtil.Tau,
        { snow: 0.7, groundY: groundY, color: 0x60666d });
      y += size * 0.4;
    }
    AddSolid(x, groundY + (y - groundY) * 0.5, z, 0.8, y - groundY, 0.8, 0,
      { surface: 'Stone', kind: 'Cairn', sight: 0.4, sound: 0.3 });
  }

  /* ---------------------------------------------------------------- *
   * 6.11 第一幕【雪窖】· 黑石峪村
   * ---------------------------------------------------------------- */

  function ScatterNature(density, treeHeight, pineRatio, rockCount, avoidRadius) {
    const total = presetData.treeCount * density;
    for (let i = 0; i < total * 4 && treeInstances.length + pineInstances.length < total; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 3, bounds.maxX - 3, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 3, bounds.maxZ - 3, random.Next());
      if (QueryRoute(route, x, z).lateral < avoidRadius) continue;
      if (SampleLane(x, z) > 0.05) continue;
      if (TerrainSteep(x, z) > 0.95) continue;
      let clash = false;
      for (let k = 0; k < solids.length; k += 1) {
        const s = solids[k];
        if (x > s.minX - 1.2 && x < s.maxX + 1.2 && z > s.minZ - 1.2 && z < s.maxZ + 1.2) { clash = true; break; }
      }
      if (clash) continue;
      const pine = random.Chance(pineRatio);
      PlantTree(x, z, (pine ? 5.5 : 5.0) * treeHeight * (0.7 + random.Next() * 0.7), pine);
    }
    for (let i = 0; i < rockCount * 4 && rockInstances.length < rockCount; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 2, bounds.maxX - 2, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 2, bounds.maxZ - 2, random.Next());
      if (QueryRoute(route, x, z).lateral < 2.6) continue;
      if (TerrainSteep(x, z) > 1.35) continue;
      const scale = 0.55 + Math.pow(random.Next(), 2) * 2.6;
      ScatterRock(x, z, scale, scale > 1.4);
    }
  }

  /**
   * 村道 / 公路的地面细节：两道车辙、被踩出来的边、路边翻出来的石头。
   * 这条踩实的痕迹就是「往哪走」的答案——不需要箭头。
   */
  function BuildLaneDetail(fromZ, toZ) {
    const steps = Math.max(8, Math.round(Math.abs(toZ - fromZ) / 2.2));
    let previousX = null;
    let previousZ = null;
    for (let i = 0; i <= steps; i += 1) {
      const z = MathUtil.Lerp(fromZ, toZ, i / steps);
      const query = QueryRoute(route, 0, z);
      const cx = query.cx;
      const cz = query.cz;
      const groundY = SampleHeight(cx, cz);
      let yaw = 0;
      if (previousX !== null) yaw = Math.atan2(cx - previousX, cz - previousZ);
      previousX = cx; previousZ = cz;
      PaintSurface(cx, cz, query.width * 0.45, 1);
      /* 路边翻出来的碎石与冻硬的土块 */
      if (i % 3 === 0) {
        for (let s = -1; s <= 1; s += 2) {
          const ex = LocalX(cx, yaw, s * (query.width * 0.5 + random.Next() * 0.9), 0);
          const ez = LocalZ(cz, yaw, s * (query.width * 0.5 + random.Next() * 0.9), 0);
          const size = 0.22 + random.Next() * 0.4;
          Piece('Rock', icoLow, ex, SampleHeight(ex, ez) + size * 0.1, ez,
            size * 1.6, size, size * 1.4, random.Next() * MathUtil.Tau,
            { snow: 0.55, color: 0x5f656c, groundY: groundY });
        }
      }
    }
  }

  function BuildVillage() {
    BuildLaneDetail(bounds.maxZ - 6, bounds.minZ + 6);

    /* —— 村口牌坊：开场第一眼。柱子落在路肩外，人从当中穿过去。—— */
    const gate = QueryRoute(route, 0, 46.5);
    const gateX = gate.cx;
    const gateZ = gate.cz;
    AddAnchor('AnchorPostcardGate', QueryRoute(route, 0, 53).cx, 53, 5, 0);
    GateArch(gateX, gateZ, 0.06);
    Cairn(gateX + 5.6, gateZ - 1.5);

    /* —— 磨坊：村里最高的房子，地窖在它背风的一侧 —— */
    const millX = -11.5;
    const millZ = -5.0;
    const millYaw = 0.32;
    const mill = House(millX, millZ, millYaw, 9.6, 7.4, 4.9,
      { burnt: false, roofFamily: 'Straw', lootId: 'LootSpotMillStove' });
    /* 二层的碾房：矮一圈压在正房上，剪影就有了层次 */
    Piece('Earth', box, LocalX(millX, millYaw, -1.4, 0), mill.wallTop + 1.25, LocalZ(millZ, millYaw, -1.4, 0),
      5.2, 2.5, 5.0, millYaw, { snow: 0.4, groundY: mill.low });
    GableRoof(LocalX(millX, millYaw, -1.4, 0), LocalZ(millZ, millYaw, -1.4, 0), millYaw, 5.4, 5.2,
      mill.wallTop + 2.5, { family: 'Straw', rise: 1.4, overhang: 0.5 });
    AddSolid(LocalX(millX, millYaw, -1.4, 0), mill.wallTop + 1.25, LocalZ(millZ, millYaw, -1.4, 0),
      5.2, 2.5, 5.0, millYaw, { surface: 'Stone', kind: 'Wall', sight: 1, sound: 0.9 });
    Millstone(LocalX(millX, millYaw, 6.4, 1.2), LocalZ(millZ, millYaw, 6.4, 1.2));

    /* 地窖门：两块斜板盖在地上。撬开它，小满在下面。 */
    const cellarX = LocalX(millX, millYaw, 1.5, 5.4);
    const cellarZ = LocalZ(millZ, millYaw, 1.5, 5.4);
    const cellarY = SampleHeight(cellarX, cellarZ);
    Piece('Stone', box, cellarX, cellarY + 0.14, cellarZ, 2.9, 0.3, 2.4, millYaw,
      { snow: 0.5, groundY: cellarY, color: 0x6f7174 });
    Piece('Rock', box, cellarX, cellarY - 0.5, cellarZ, 2.1, 1.2, 1.7, millYaw,
      { color: 0x24282d, snow: 0, ao: 1.5, groundY: cellarY });
    AddMover('CellarDoor', cellarX, cellarY + 0.28, cellarZ, millYaw, millYaw, (batch) => {
      for (let s = -1; s <= 1; s += 2) {
        pieceEuler.set(-0.28, 0, 0, 'YXZ');
        pieceQuaternion.setFromEuler(pieceEuler);
        piecePosition.set(0, 0.16, s * 0.62);
        pieceScale.set(2.2, 0.11, 1.25);
        pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
        styleScratch.color = 0x6d5f4b; styleScratch.snowColor = Palette.SnowLit;
        styleScratch.snow = 0.7; styleScratch.ao = 0.7; styleScratch.soot = 0;
        styleScratch.tone = 1; styleScratch.groundY = -0.3; styleScratch.uvScale = 0.55;
        AppendPiece(batch, box, pieceMatrix, styleScratch);
        piecePosition.set(0, 0.24, s * 0.62);
        pieceScale.set(0.14, 0.06, 1.2);
        pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
        styleScratch.color = 0x574a38;
        AppendPiece(batch, box, pieceMatrix, styleScratch);
      }
    });
    AddSolid(cellarX, cellarY + 0.2, cellarZ, 2.6, 0.5, 2.2, millYaw,
      { surface: 'Wood', kind: 'Hatch', sight: 0.4, sound: 0.5 });
    AddInteract('InteractableCellarDoor', 'Door', '撬开地窖门', cellarX, cellarZ, cellarY + 0.5,
      { seconds: 2.6, noiseRadius: Config.Stealth.Noise.doorForce, requiresItem: 'Crowbar' });
    AddAnchor('AnchorCellar', cellarX, cellarZ + 1.8, 2.4, millYaw);
    LifeDetails(cellarX + 1.9, cellarZ + 0.7, millYaw, 'Toy');

    /* —— 村子中心：老槐树、碾盘、水井 —— */
    AddAnchor('AnchorVillageCenter', 0, 1.5, 4, Math.PI);
    PlantTree(-4.8, 7.2, 9.5, false);
    Well(3.4, 5.6);
    Millstone(-0.6, -1.2);
    LifeDetails(2.0, 6.8, 0.4, 'Bucket');
    AddZone('TriggerVillageSquare', 0, 1.5, 7, 'Zone', { name: 'Square' });

    /* —— 沿街的院子：夯土院墙夹出巷子，这是潜行的骨架 —— */
    const plots = [
      { x: 12.5, z: 30, yaw: -0.22, w: 7.2, d: 6.0, burnt: true, court: 12.5, courtD: 11 },
      { x: -6.5, z: 26, yaw: 0.15, w: 6.6, d: 5.6, burnt: false, court: 11.5, courtD: 10 },
      { x: 14.0, z: 13.5, yaw: -0.35, w: 7.6, d: 6.2, burnt: true, court: 13, courtD: 11 },
      { x: -13.0, z: 12.0, yaw: 0.42, w: 6.8, d: 5.8, burnt: false, court: 12, courtD: 10.5 },
      { x: 11.0, z: -3.0, yaw: -0.12, w: 8.0, d: 6.4, burnt: true, court: 14, courtD: 12 },
      { x: -22.0, z: -0.5, yaw: 0.55, w: 6.4, d: 5.4, burnt: true, court: 11, courtD: 10 },
      { x: 9.0, z: -19.0, yaw: 0.28, w: 7.0, d: 5.8, burnt: false, court: 12.5, courtD: 11 },
      { x: -16.5, z: -21.0, yaw: -0.42, w: 6.6, d: 5.6, burnt: true, court: 11.5, courtD: 10 },
      { x: 3.0, z: -32.0, yaw: 0.18, w: 6.2, d: 5.2, burnt: true, court: 11, courtD: 9.5 },
      { x: -20.0, z: -33.0, yaw: 0.62, w: 6.0, d: 5.0, burnt: false, court: 10.5, courtD: 9.5 },
    ];
    for (let i = 0; i < plots.length; i += 1) {
      const plot = plots[i];
      /* 院墙的门朝着村道开——巷口永远对着玩家该去的方向 */
      const towardLane = QueryRoute(route, plot.x, plot.z);
      const gateSide = (plot.z > towardLane.cz) ? 0 : 1;
      CourtyardWall(plot.x, plot.z - (plot.z > 0 ? 2.4 : -2.4), plot.yaw, plot.court, plot.courtD, {
        height: 1.9, broken: plot.burnt, gateSide: gateSide,
        dogHoleSide: i === 4 ? 2 : undefined, dogHoleId: 'InteractableVillageDogHole',
      });
      House(plot.x, plot.z, plot.yaw + (plot.z > 0 ? Math.PI : 0), plot.w, plot.d, 2.85 + random.Next() * 0.5, {
        burnt: plot.burnt,
        lootId: 'LootSpotStove' + i,
        doorId: plot.burnt ? undefined : 'InteractableDoor' + i,
      });
      /* 院里的日子：柴垛、草垛、缸、晾衣绳、独轮车 */
      const yardX = LocalX(plot.x, plot.yaw, plot.court * 0.26, (plot.z > 0 ? -1 : 1) * plot.courtD * 0.3);
      const yardZ = LocalZ(plot.z, plot.yaw, plot.court * 0.26, (plot.z > 0 ? -1 : 1) * plot.courtD * 0.3);
      if (i % 3 === 0) Woodpile(yardX, yardZ, plot.yaw + 1.2, 2.6 + random.Next());
      if (i % 3 === 1) Haystack(yardX, yardZ, 1);
      if (i % 3 === 2) Clothesline(yardX, yardZ, plot.yaw + 0.6, 3.4);
      Jar(LocalX(plot.x, plot.yaw, -plot.court * 0.22, (plot.z > 0 ? -1 : 1) * plot.courtD * 0.26),
        LocalZ(plot.z, plot.yaw, -plot.court * 0.22, (plot.z > 0 ? -1 : 1) * plot.courtD * 0.26),
        1, plot.burnt, { loot: 'LootSpotJar' + i });
      if (plot.burnt) {
        lootSpots.push({ id: 'LootSpotJar' + i,
          position: new THREE.Vector3(plot.x, SampleHeight(plot.x, plot.z), plot.z),
          container: 'Jar', tableId: 'TableVillage' });
      }
      if (i === 4) Barrow(yardX + 2.6, yardZ - 1.4, plot.yaw + 0.9);
    }

    /* —— 打谷场：村东南的一块平地，碾子、草垛、翻倒的车 —— */
    PaintSurface(20, 22, 7.5, 4);
    Haystack(18.5, 24.5, 1.35);
    Haystack(22.5, 20.0, 1.1);
    Barrow(19.5, 18.5, 1.9);
    Woodpile(24.0, 24.5, 0.4, 3.2);
    AddAnchor('AnchorThreshingFloor', 20.5, 22, 5, 0);

    /* —— 东坡梯田 —— */
    BuildTerraceWalls(22, 46, bounds.minZ + 6, bounds.maxZ - 6);

    /* —— 西边的窑洞崖 —— */
    for (let i = 0; i < 3; i += 1) {
      const cz = -6 + i * 9.5;
      CaveDwelling(-27.5, cz, -Math.PI / 2 + 0.08, 2.5 + random.Next() * 0.5);
    }
    AddAnchor('AnchorCaveRow', -25, 3, 4, -Math.PI / 2);

    /* —— 河沟的冰面 —— */
    for (let i = 0; i < 16; i += 1) {
      const z = bounds.minZ + 8 + i * ((spanZ - 16) / 15);
      const x = -33 + Math.sin(z * 0.045) * 4.5;
      const groundY = SampleHeight(x, z);
      Piece('Ice', quad, x, groundY + 0.04, z, 6.5, 1, (spanZ - 16) / 15 * 1.15, 0,
        { snow: 0.18, ao: 0.4, groundY: groundY });
      if (i % 4 === 0) ScatterRock(x + 3.6, z + 1.5, 1.4, true);
    }

    /* —— 北面豁口：出村的路。牌坊在南，这里是一段石砌的隘口 —— */
    const exitX = -7;
    const exitZ = -50;
    /* 豁口两侧的石隘：一排各自落地的大石头，一块压一块，不是浮在半空的方糖 */
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 5; i += 1) {
        const px = exitX + s * (4.6 + i * 1.35);
        const pz = exitZ + (i - 2) * 2.9 + (random.Next() - 0.5) * 1.6;
        const scale = 3.4 + random.Next() * 1.8 + i * 0.4;
        const groundY = GroundUnder(px, pz, scale * 0.5) - scale * 0.24;
        const height = scale * (0.85 + random.Next() * 0.5);
        Piece('Rock', ico, px, groundY + height * 0.30, pz,
          scale * 1.15, height, scale * (0.85 + random.Next() * 0.4), random.Next() * MathUtil.Tau,
          { pitch: (random.Next() - 0.5) * 0.2, snow: 0.62, groundY: groundY, color: 0x5a6068 });
        AddSolid(px, groundY + height * 0.35, pz, scale * 1.05, height, scale * 0.9, 0,
          { surface: 'Stone', kind: 'Rock', sight: 1, sound: 0.75 });
        if (i < 2) AddCover(px - s * (scale * 0.6), pz, -s, 0.25, 1.65, 'Rock', 2.6);
      }
    }
    AddAnchor('AnchorVillageExit', exitX, exitZ - 3, 3.5, 0);
    AddAnchor('AnchorPostcardExit', exitX, exitZ + 12, 5, 0);
    AddZone('TriggerVillageExit', exitX, exitZ, 6, 'Zone', { name: 'Exit' });
    Cairn(exitX + 3.4, exitZ + 5.5);

    /* —— 还在冒烟的院子：全村最沉的一笔 —— */
    Firepit(6.5, -6.5, { radius: 8, intensity: 2.6, id: 'InteractableVillageFire' });
    Firepit(-19.5, 20.5, { radius: 7, intensity: 2.2, id: 'InteractableYardFire' });
    Firepit(-4.0, -35.5, { radius: 7, intensity: 2.0, id: 'InteractableNorthFire' });
    Smolder(11.5, -3.2, 1.1);
    Smolder(13.2, 14.0, 0.8);
    Smolder(-15.0, -20.0, 0.9);
    /* 村里也要有岩石与灌木的碎形，不然全是直角 */
    for (let i = 0; i < 22; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 8, bounds.maxX - 8, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 8, bounds.maxZ - 8, random.Next());
      if (QueryRoute(route, x, z).lateral < 5) continue;
      if (TerrainSteep(x, z) > 1.2) continue;
      let clash = false;
      for (let k = 0; k < solids.length; k += 1) {
        const s = solids[k];
        if (x > s.minX - 2 && x < s.maxX + 2 && z > s.minZ - 2 && z < s.maxZ + 2) { clash = true; break; }
      }
      if (clash) continue;
      RockOutcrop(x, z, 1.1 + random.Next() * 2.2, random.Chance(0.2));
    }

    /* —— 路边的零碎 —— */
    Jar(1.8, 18.5, 1.1, true, {});
    Jar(-4.2, -14.0, 0.95, false, { loot: 'LootSpotRoadJar' });
    lootSpots.push({ id: 'LootSpotRoadJar', position: new THREE.Vector3(-4.2, SampleHeight(-4.2, -14), -14),
      container: 'Jar', tableId: 'TableVillage' });
    Barrow(-2.5, 33.0, 2.4);
    DoorLeaf(4.2, 24.0, 1.1, true);
    Fence(16.5, 36.0, 16.5, 26.0, { gap: true });
    Fence(-9.5, 35.0, -1.5, 35.5, { gap: true });
    Fence(-12.0, -12.0, -12.0, -3.0, { gap: true });
    Clothesline(-8.0, -8.5, 1.1, 4.0);
    Haystack(-5.5, -26.0, 1.2);
    Haystack(6.5, -40.0, 1.0);
    Haystack(-17.0, 8.5, 1.05);

    ScatterNature(1.0, 1.0, 0.25, presetData.coverCount, 3.2);

    /* —— 敌人：伪军搜村小队从南面来，一路往北推 —— */
    const patrolA = [
      new THREE.Vector3(10, 0, 40), new THREE.Vector3(5, 0, 24),
      new THREE.Vector3(13, 0, 12), new THREE.Vector3(2, 0, 2),
    ];
    const patrolB = [
      new THREE.Vector3(-8, 0, 20), new THREE.Vector3(-14, 0, 6),
      new THREE.Vector3(-6, 0, -8), new THREE.Vector3(-16, 0, -18),
    ];
    patrolRoutes.RoutePuppetSweepEast = patrolA;
    patrolRoutes.RoutePuppetSweepWest = patrolB;
    const posts = [
      { x: 10, z: 40, yaw: Math.PI, arc: 100, squad: 'SquadPuppetA', type: 'PuppetOfficer', route: patrolA },
      { x: 6, z: 33, yaw: Math.PI, arc: 90, squad: 'SquadPuppetA', type: 'PuppetSoldier', route: patrolA },
      { x: 15, z: 22, yaw: Math.PI + 0.6, arc: 90, squad: 'SquadPuppetA', type: 'PuppetSoldier', route: null },
      { x: -8, z: 20, yaw: Math.PI - 0.5, arc: 90, squad: 'SquadPuppetB', type: 'PuppetSoldier', route: patrolB },
      { x: -14, z: 7, yaw: Math.PI, arc: 110, squad: 'SquadPuppetB', type: 'PuppetSoldier', route: patrolB },
      { x: 3, z: 9, yaw: Math.PI + 0.3, arc: 120, squad: 'SquadPuppetA', type: 'PuppetSoldier', route: null },
    ];
    for (let i = 0; i < posts.length; i += 1) {
      const p = posts[i];
      enemyPosts.push({ id: 'EnemyPost' + i, position: new THREE.Vector3(p.x, SampleHeight(p.x, p.z), p.z),
        yaw: p.yaw, lookArcDeg: p.arc, squadId: p.squad, archetype: p.type, route: p.route });
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.12 第二幕【断谷】· 山谷公路 · 碉堡哨卡 · 断桥
   * ---------------------------------------------------------------- */

  function BuildValley() {
    /* 公路：踩实的土面 + 车辙 */
    BuildLaneDetail(bounds.maxZ - 5, bounds.minZ + 5);
    AddAnchor('AnchorRoadEdge', 5, 42, 3.2, Math.PI);
    AddZone('TriggerRoadSighted', 5, 44, 8, 'Zone', { name: 'Road' });

    /* —— 断桥（明信片一）：站在桥头往北看，沟底、对岸、再往北是碉堡 —— */
    BrokenBridge(0, 17, 0.08, 18);
    AddAnchor('AnchorPostcardBridge', 3.5, 27, 5, Math.PI);
    AddAnchor('AnchorGorgeFloor', -5, 17, 4, Math.PI);
    /* 沟底横着一根被炸倒的电杆，是过沟的桥 */
    const logY = SampleHeight(-6, 17);
    Piece('Timber', cyl8, -6, logY + 0.55, 17, 0.42, 9.5, 0.42, 0.12,
      { roll: Math.PI / 2, pitch: 0.05, snow: 0.55, groundY: logY, color: 0x5f5341 });
    AddSolid(-6, logY + 0.3, 17, 9.6, 0.7, 0.7, Math.PI / 2 + 0.12,
      { surface: 'Wood', kind: 'Log', sight: 0.2, sound: 0.15 });

    /* —— 碉堡（明信片二）：架在公路东侧的土台上，整条谷都在它眼皮底下 —— */
    Pillbox(15.5, -7.5, -0.5);
    AddAnchor('AnchorPostcardPillbox', 2, 8, 5, Math.PI);

    /* —— 哨卡：拒马、沙袋、岗楼、铁丝网 —— */
    const gateZ = -4;
    Sandbag(-6.2, gateZ + 1.2, 0.1, 4);
    Sandbag(5.0, gateZ + 1.2, 0.1, 4);
    Sandbag(-7.5, gateZ - 3.0, 1.6, 3);
    Sandbag(6.4, gateZ - 3.4, 1.6, 3);
    /* 岗楼：一间小板房，里面立着枪架 */
    const shackX = 6.8;
    const shackZ = gateZ - 6.5;
    const shack = House(shackX, shackZ, Math.PI + 0.1, 4.2, 3.6, 2.4,
      { burnt: false, roofFamily: 'Straw', lootId: 'LootSpotShackStove' });
    AddInteract('InteractableRifleRack', 'StoryItem', '取下那支中正式',
      LocalX(shackX, Math.PI + 0.1, -1.0, -0.9), LocalZ(shackZ, Math.PI + 0.1, -1.0, -0.9),
      shack.baseY + 0.9, { seconds: 1.6, noiseRadius: 3 });
    Piece('Timber', box, LocalX(shackX, Math.PI + 0.1, -1.0, -0.9), shack.baseY + 0.6,
      LocalZ(shackZ, Math.PI + 0.1, -1.0, -0.9), 1.3, 1.2, 0.28, Math.PI + 0.1,
      { snow: 0.1, groundY: shack.baseY, color: 0x6d5f4b });
    Firepit(3.2, gateZ - 8.5, { radius: 7, intensity: 2.4, id: 'InteractableCheckpointFire' });

    /* 拦路杆：能开的 */
    const barX = -0.5;
    const barGround = SampleHeight(barX, gateZ);
    Piece('Timber', cyl8, barX - 4.2, barGround + 0.7, gateZ, 0.3, 1.4, 0.3, 0,
      { snow: 0.3, groundY: barGround });
    AddMover('CheckpointBar', barX - 4.2, barGround + 1.2, gateZ, 0, -1.35, (batch) => {
      pieceEuler.set(0, 0, 0, 'YXZ');
      pieceQuaternion.setFromEuler(pieceEuler);
      piecePosition.set(4.4, 0, 0);
      pieceScale.set(9.0, 0.16, 0.16);
      pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
      styleScratch.color = 0x8a8277; styleScratch.snowColor = Palette.SnowLit;
      styleScratch.snow = 0.5; styleScratch.ao = 0.4; styleScratch.soot = 0;
      styleScratch.tone = 1; styleScratch.groundY = -1.2; styleScratch.uvScale = 0.6;
      AppendPiece(batch, box, pieceMatrix, styleScratch);
      for (let i = 0; i < 5; i += 1) {
        piecePosition.set(1.0 + i * 1.7, 0, 0);
        pieceScale.set(0.85, 0.17, 0.17);
        pieceMatrix.compose(piecePosition, pieceQuaternion, pieceScale);
        styleScratch.color = 0x3a3a38;
        AppendPiece(batch, box, pieceMatrix, styleScratch);
      }
    });
    AddInteract('InteractableCheckpointBar', 'Lever', '抬起拦路杆', barX, gateZ, barGround + 1.2,
      { seconds: 1.4, noiseRadius: 8 });

    /* 院墙 + 狗洞：小满从这儿钻进去开里面的门 */
    CourtyardWall(10.5, gateZ - 12.0, 0.1, 13, 11, {
      height: 2.05, broken: false, gateSide: 0, dogHoleSide: 2, dogHoleId: 'InteractableDogHole',
    });
    AddInteract('InteractableCompoundGate', 'Door', '从里面拉开门闩',
      10.5, gateZ - 6.4, SampleHeight(10.5, gateZ - 6.4) + 1.0,
      { seconds: 1.6, noiseRadius: Config.Stealth.Noise.doorOpen });
    Jar(13.5, gateZ - 15.0, 1.0, false, { loot: 'LootSpotCompoundJar' });
    lootSpots.push({ id: 'LootSpotCompoundJar',
      position: new THREE.Vector3(13.5, SampleHeight(13.5, gateZ - 15), gateZ - 15),
      container: 'Jar', tableId: 'TableCheckpoint' });
    lootSpots.push({ id: 'LootSpotShackStove',
      position: new THREE.Vector3(shackX, shack.baseY, shackZ), container: 'Stove', tableId: 'TableCheckpoint' });

    /* 铁丝网：从崖脚拉到路边，逼玩家走该走的地方 */
    BarbedWire(-22, gateZ + 3, -7.5, gateZ + 3);
    BarbedWire(6.5, gateZ + 3, 21, gateZ + 3);
    BarbedWire(-20, gateZ - 14, -8, gateZ - 10);
    AddAnchor('AnchorCheckpointPast', -2, gateZ - 17, 3.2, Math.PI);
    AddZone('TriggerCheckpoint', 0, gateZ, 11, 'Zone', { name: 'Checkpoint' });

    /* 电线杆一路往北，把视线牵到谷口 */
    TelegraphLine([
      { x: 15.5, z: 60, yaw: 0.1 }, { x: 12.5, z: 42, yaw: 0.1 }, { x: 10.0, z: 25, yaw: 0.1 },
      { x: 8.5, z: 4, yaw: 0.1 }, { x: 5.0, z: -16, yaw: 0.1 }, { x: 0.5, z: -36, yaw: 0.1 },
      { x: -3.5, z: -56, yaw: 0.1 },
    ]);

    /* 谷底不能是一张白纸：石脊、倒木、灌木、车辙旁的碎石 */
    for (let i = 0; i < 34; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 6, bounds.maxX - 6, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 6, bounds.maxZ - 6, random.Next());
      const lateral = QueryRoute(route, x, z).lateral;
      if (lateral < 4.2) continue;
      if (TerrainSteep(x, z) > 1.4) continue;
      RockOutcrop(x, z, 1.2 + random.Next() * 2.6, random.Chance(0.25));
    }
    for (let i = 0; i < 6; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 14, bounds.maxX - 14, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 14, bounds.maxZ - 14, random.Next());
      if (QueryRoute(route, x, z).lateral < 5.5) continue;
      if (TerrainSteep(x, z) > 1.0) continue;
      Deadfall(x, z, random.Next() * MathUtil.Tau, 4.0 + random.Next() * 3);
    }

    /* 谷口岔道 */
    AddAnchor('AnchorValleyExit', -9, -62, 3.5, 0);
    AddZone('TriggerValleyExit', -9, -62, 7, 'Zone', { name: 'Exit' });
    Cairn(-5.5, -56);
    Cairn(-12.5, -52);

    /* 路边翻掉的辎重车与废墟：谷里发生过事 */
    Barrow(4.5, 30.0, 1.2);
    Smolder(-9.5, 8.0, 0.9);
    House(-14.5, 30.0, 0.5, 6.4, 5.4, 2.7, { burnt: true, lootId: 'LootSpotValleyStove' });
    lootSpots.push({ id: 'LootSpotValleyStove',
      position: new THREE.Vector3(-14.5, SampleHeight(-14.5, 30), 30), container: 'Stove', tableId: 'TableValley' });
    Haystack(-11.5, 36.0, 1.15);
    Haystack(12.0, 22.0, 1.0);
    Woodpile(-13.0, 24.0, 0.8, 3.0);

    ScatterNature(1.0, 1.05, 0.55, presetData.coverCount, 3.6);

    const patrolRoad = [
      new THREE.Vector3(2, 0, 8), new THREE.Vector3(-1, 0, -2),
      new THREE.Vector3(-3, 0, -16), new THREE.Vector3(0, 0, -2),
    ];
    patrolRoutes.RouteCheckpointRoad = patrolRoad;
    const posts = [
      { x: -2.5, z: gateZ + 2.0, yaw: Math.PI, arc: 100, squad: 'SquadGate', type: 'PuppetSoldier', route: null },
      { x: 3.5, z: gateZ + 2.0, yaw: Math.PI, arc: 100, squad: 'SquadGate', type: 'PuppetSoldier', route: null },
      { x: 0, z: gateZ - 3.0, yaw: Math.PI, arc: 120, squad: 'SquadGate', type: 'PuppetOfficer', route: patrolRoad },
      { x: 15.5, z: -7.5, yaw: Math.PI + 0.4, arc: 140, squad: 'SquadBunker', type: 'JapaneseSoldier', route: null },
      { x: 8.5, z: -14.0, yaw: 0.4, arc: 90, squad: 'SquadBunker', type: 'PuppetSoldier', route: null },
      { x: -6.0, z: 20.0, yaw: 0.2, arc: 100, squad: 'SquadRoad', type: 'PuppetSoldier', route: null },
    ];
    for (let i = 0; i < posts.length; i += 1) {
      const p = posts[i];
      enemyPosts.push({ id: 'EnemyPost' + i, position: new THREE.Vector3(p.x, SampleHeight(p.x, p.z), p.z),
        yaw: p.yaw, lookArcDeg: p.arc, squadId: p.squad, archetype: p.type, route: p.route });
    }
  }

  /* ---------------------------------------------------------------- *
   * 6.13 第三幕【风雪垭口】· 暴雪山脊 · 岩缝 · 探照灯塔
   * ---------------------------------------------------------------- */

  function BuildPass() {
    BuildLaneDetail(bounds.maxZ - 8, bounds.minZ + 8);

    /* —— 岩缝小径：两堵岩壁夹出一条只容一人的缝 —— */
    for (let i = 0; i < 12; i += 1) {
      const z = 26 - i * 2.6;
      const width = 1.9 + Math.sin(i * 0.7) * 0.5;
      for (let s = -1; s <= 1; s += 2) {
        const x = -2 + s * (width + 1.5);
        const groundY = GroundUnder(x, z, 2.2) - 1.2;
        const height = 5.4 + random.Next() * 3.4;
        Piece('Rock', ico, x, groundY + height * 0.32, z, 3.8 + random.Next(), height, 3.4 + random.Next(),
          random.Next() * MathUtil.Tau, { snow: 0.5, groundY: groundY, color: 0x5d636b });
        AddSolid(x + s * 0.6, groundY + height * 0.4, z, 3.4, height, 3.0, 0,
          { surface: 'Stone', kind: 'Cliff', sight: 1, sound: 0.9 });
        if (i % 3 === 0) AddCover(x - s * 1.9, z, -s, 0, 1.7, 'Rock', 2.4);
      }
      if (i % 4 === 1) Cairn(-2 + (i % 2 ? 1.1 : -1.1), z);
    }
    AddAnchor('AnchorCrevice', -2, 18, 4, 0);
    AddZone('TriggerCrevice', -2, 18, 7, 'Zone', { name: 'Crevice' });

    /* —— 背风的岩檐：唯一能回暖的地方 —— */
    const shelterX = -9.5;
    const shelterZ = 6.0;
    const shelterY = GroundUnder(shelterX, shelterZ, 2.6) - 0.5;
    Piece('Rock', box, shelterX - 2.2, shelterY + 1.6, shelterZ, 3.0, 3.4, 4.6, 0.3,
      { snow: 0.45, groundY: shelterY, color: 0x5a6068 });
    Piece('Rock', box, shelterX, shelterY + 2.9, shelterZ, 5.2, 1.0, 4.4, 0.3,
      { pitch: 0.14, snow: 0.8, groundY: shelterY, color: 0x5d636b });
    AddSolid(shelterX - 2.2, shelterY + 1.6, shelterZ, 3.0, 3.4, 4.6, 0.3,
      { surface: 'Stone', kind: 'Cliff', sight: 1, sound: 0.9 });
    AddSolid(shelterX, shelterY + 3.0, shelterZ, 5.2, 1.0, 4.4, 0.3,
      { surface: 'Stone', kind: 'Overhang', sight: 1, sound: 0.8 });
    AddRoom(shelterX + 0.4, shelterZ, 2.0, 2.0, 0.3, true);
    AddConcealer(shelterX + 0.6, shelterZ, 3.0, 0.6);
    Firepit(shelterX + 0.8, shelterZ, { radius: 8, intensity: 2.8, id: 'InteractablePassFire' });
    Woodpile(shelterX + 0.4, shelterZ - 2.4, 0.3, 2.0);
    AddAnchor('AnchorShelter', shelterX + 0.8, shelterZ, 3.5, 0);

    /* —— 垭口：界碑与两侧的山肩 —— */
    AddAnchor('AnchorPassTop', 2, -1, 4, 0);
    AddZone('TriggerPassTop', 2, -1, 8, 'Zone', { name: 'Saddle' });
    const markerY = SampleHeight(4.5, -2);
    Piece('Stone', box, 4.5, markerY + 0.85, -2, 0.62, 1.7, 0.3, 0.2,
      { snow: 0.7, groundY: markerY, color: 0x74767a });
    AddSolid(4.5, markerY + 0.85, -2, 0.7, 1.7, 0.4, 0.2, { surface: 'Stone', kind: 'Marker', sight: 0.5, sound: 0.4 });
    Cairn(-1.5, -4.5);
    Cairn(7.5, 2.0);
    /* 明信片：从垭口往北看，山谷在脚下铺开，远处有一点灯火 */
    AddAnchor('AnchorPostcardSaddle', 2, -6, 5, 0);

    /* —— 探照灯塔：垭口东肩，居高临下 —— */
    const towerY = SearchTower(14.5, -9.0, 0.4, 8.6);
    AddAnchor('AnchorSearchTower', 14.5, -9.0, 4, 0);
    AddAnchor('AnchorPostcardTower', 6.5, 4.5, 5, 0);
    enemyPosts.push({ id: 'EnemyPostTower',
      position: new THREE.Vector3(14.5, towerY, -9.0), yaw: Math.PI, lookArcDeg: 180,
      squadId: 'SquadSearch', archetype: 'JapaneseNco', route: null });

    /* —— 风蚀的雪脊与裸岩：山上没有村子，只有形状 —— */
    for (let i = 0; i < 26; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 6, bounds.maxX - 6, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 6, bounds.maxZ - 6, random.Next());
      if (QueryRoute(route, x, z).lateral < 3.2) continue;
      if (TerrainSteep(x, z) > 0.8) continue;
      const length = 3.0 + random.Next() * 4.5;
      const driftYaw = Math.atan2(windX, windZ) + (random.Next() - 0.5) * 0.5;
      const groundY = GroundUnder(x, z, length * 0.4);
      for (let k = 0; k < 3; k += 1) {
        const t = (k / 2 - 0.5) * length * 0.62;
        const px = x + Math.cos(driftYaw) * t;
        const pz = z - Math.sin(driftYaw) * t;
        const lump = 0.9 + random.Next() * 0.7;
        Piece('Snow', dome, px, GroundUnder(px, pz, lump) - lump * 0.62, pz,
          lump * 2.4, lump * 1.7, lump * 3.2, driftYaw,
          { snow: 0.45, color: Palette.SnowMid, groundY: groundY, ao: 0.55 });
      }
      AddSolid(x, groundY + 0.28, z, 2.6, 0.7, length, driftYaw,
        { surface: 'Snow', kind: 'Drift', sight: 0.35, sound: 0.35, conceal: 0.3 });
      AddConcealer(x, z, length * 0.5, 0.35);
    }

    /* —— 下坡：目标点在垭口北面 —— */
    AddAnchor('AnchorSlopeBottom', 1, -50, 4, 0);
    AddZone('TriggerSlopeBottom', 1, -50, 8, 'Zone', { name: 'SlopeBottom' });
    Cairn(3.5, -30);
    Cairn(-1.0, -42);
    /* 坡下一间空的护林房，是「已经走到人间边上」的信号 */
    House(-9.0, -46.0, 0.4, 5.4, 4.6, 2.6, { burnt: false, lootId: 'LootSpotPassStove' });
    lootSpots.push({ id: 'LootSpotPassStove',
      position: new THREE.Vector3(-9, SampleHeight(-9, -46), -46), container: 'Stove', tableId: 'TablePass' });

    /* —— 山上的地形语言：岩脊沿等高线排，倒木压在坡上，路杆一路指到垭口 —— */
    for (let i = 0; i < 46; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 8, bounds.maxX - 8, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 8, bounds.maxZ - 8, random.Next());
      const lateral = QueryRoute(route, x, z).lateral;
      if (lateral < 4.5) continue;
      if (TerrainSteep(x, z) > 1.5) continue;
      RockOutcrop(x, z, 1.5 + random.Next() * 3.2, random.Chance(0.35));
    }
    /* 路两侧压低的岩块：把小径「夹」出来，玩家不用看箭头也知道该走哪 */
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      const along = MathUtil.Lerp(bounds.maxZ - 10, bounds.minZ + 10, t);
      const query = QueryRoute(route, 0, along);
      for (let side = -1; side <= 1; side += 2) {
        if (random.Chance(0.35)) continue;
        const px = query.cx + side * (query.width * 0.5 + 1.6 + random.Next() * 2.4);
        const pz = query.cz + (random.Next() - 0.5) * 3;
        if (!IsInsideBounds(px, pz)) continue;
        RockOutcrop(px, pz, 1.0 + random.Next() * 1.6, false);
      }
      if (i % 5 === 2) {
        PathMarker(query.cx + (i % 2 ? 2.4 : -2.4), query.cz);
      }
    }
    for (let i = 0; i < 9; i += 1) {
      const x = MathUtil.Lerp(bounds.minX + 12, bounds.maxX - 12, random.Next());
      const z = MathUtil.Lerp(bounds.minZ + 12, bounds.maxZ - 12, random.Next());
      if (QueryRoute(route, x, z).lateral < 5) continue;
      if (TerrainSteep(x, z) > 1.1) continue;
      Deadfall(x, z, random.Next() * MathUtil.Tau, 4.5 + random.Next() * 3.5);
    }
    Deadfall(-4.5, 34.0, 1.35, 6.5);
    Deadfall(4.0, -24.0, 0.4, 5.5);

    ScatterNature(1.0, 0.85, 0.75, presetData.coverCount, 3.0);

    const searchRoute = [
      new THREE.Vector3(6, 0, 14), new THREE.Vector3(-6, 0, 6),
      new THREE.Vector3(2, 0, -6), new THREE.Vector3(12, 0, 2),
    ];
    patrolRoutes.RouteSearchLine = searchRoute;
    const posts = [
      { x: 5, z: 16, yaw: Math.PI, arc: 110, squad: 'SquadSearch', type: 'JapaneseSoldier', route: searchRoute },
      { x: -7, z: 10, yaw: Math.PI - 0.4, arc: 100, squad: 'SquadSearch', type: 'JapaneseSoldier', route: searchRoute },
      { x: 9, z: -4, yaw: 0.5, arc: 120, squad: 'SquadSearch', type: 'Dog', route: searchRoute },
      { x: -3, z: -18, yaw: 0.2, arc: 100, squad: 'SquadDown', type: 'JapaneseSoldier', route: null },
      { x: 8, z: -28, yaw: 0.1, arc: 110, squad: 'SquadDown', type: 'PuppetSoldier', route: null },
    ];
    for (let i = 0; i < posts.length; i += 1) {
      const p = posts[i];
      enemyPosts.push({ id: 'EnemyPost' + i, position: new THREE.Vector3(p.x, SampleHeight(p.x, p.z), p.z),
        yaw: p.yaw, lookArcDeg: p.arc, squadId: p.squad, archetype: p.type, route: p.route });
    }
  }

  if (preset === 'Village') BuildVillage();
  else if (preset === 'Valley') BuildValley();
  else BuildPass();

  /* —— 三幕都要能解析的锚点：缺哪个补哪个，Story 永远拿得到东西 —— */
  const requiredAnchors = ['AnchorVillageCenter', 'AnchorVillageExit', 'AnchorCellar', 'AnchorRoadEdge',
    'AnchorCheckpointPast', 'AnchorValleyExit', 'AnchorPassTop', 'AnchorSlopeBottom'];
  for (let i = 0; i < requiredAnchors.length; i += 1) {
    if (storyAnchors[requiredAnchors[i]]) continue;
    const t = (i + 0.5) / requiredAnchors.length;
    const point = route.points[Math.min(route.points.length - 1, Math.floor(t * route.points.length))];
    AddAnchor(requiredAnchors[i], point.x, point.z, 3.5, 0);
  }

  /* ---------------------------------------------------------------- *
   * 6.14 收尾工序：墙根积雪 → 宽相加速 → 合批出网格 → 天空开阔度
   * ---------------------------------------------------------------- */

  /** 背风墙根堆雪。自动跑一遍，所有墙都「坐」进雪里，没有一条干净的直角边。 */
  (function BuildWallDrifts() {
    const source = solids.slice();
    const driftYaw = Math.atan2(-windX, -windZ);
    for (let i = 0; i < source.length; i += 1) {
      const s = source[i];
      if (s.kind !== 'Wall' && s.kind !== 'Ruin' && s.kind !== 'Terrace' && s.kind !== 'Bunker') continue;
      const height = s.maxY - s.minY;
      if (height < 1.1) continue;
      const length = Math.max(s.hx, s.hz) * 2;
      if (length < 1.6) continue;
      const count = MathUtil.Clamp(Math.round(length / 3.2), 1, 4);
      for (let k = 0; k < count; k += 1) {
        const t = (k + 0.5) / count - 0.5;
        const along = t * length * 0.9;
        const useX = s.hx >= s.hz;
        const lx = useX ? along : (windX > 0 ? -s.hx : s.hx) * 1.1;
        const lz = useX ? (windZ > 0 ? -s.hz : s.hz) * 1.1 : along;
        const yaw = Math.atan2(s.sin, s.cos);
        const px = LocalX(s.cx, yaw, lx, lz);
        const pz = LocalZ(s.cz, yaw, lx, lz);
        if (!IsInsideBounds(px, pz)) continue;
        const groundY = SampleHeight(px, pz);
        const size = 0.9 + random.Next() * 1.2;
        Piece('Snow', dome, px, groundY - size * 0.46, pz, size * 1.7, size * 1.3, size * 2.3,
          driftYaw + (random.Next() - 0.5) * 0.6,
          { snow: 0.5, color: Palette.SnowMid, ao: 0.55, groundY: groundY });
      }
    }
  }());

  /* —— 宽相网格：1000+ 碰撞体，逐个线性扫是不可接受的 —— */
  const broadCell = 4;
  const broadCols = Math.max(1, Math.ceil(spanX / broadCell));
  const broadRows = Math.max(1, Math.ceil(spanZ / broadCell));
  const broadphase = new Array(broadCols * broadRows);
  for (let i = 0; i < broadphase.length; i += 1) broadphase[i] = [];
  function BroadCol(x) { return MathUtil.Clamp(Math.floor((x - bounds.minX) / broadCell), 0, broadCols - 1); }
  function BroadRow(z) { return MathUtil.Clamp(Math.floor((z - bounds.minZ) / broadCell), 0, broadRows - 1); }
  for (let i = 0; i < solids.length; i += 1) {
    const s = solids[i];
    const colMin = BroadCol(s.minX); const colMax = BroadCol(s.maxX);
    const rowMin = BroadRow(s.minZ); const rowMax = BroadRow(s.maxZ);
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let col = colMin; col <= colMax; col += 1) broadphase[row * broadCols + col].push(i);
    }
  }
  const solidStamp = new Int32Array(solids.length);
  let solidTick = 0;

  function QuerySolids(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    solidTick += 1;
    const colMin = BroadCol(minX); const colMax = BroadCol(maxX);
    const rowMin = BroadRow(minZ); const rowMax = BroadRow(maxZ);
    for (let row = rowMin; row <= rowMax; row += 1) {
      for (let col = colMin; col <= colMax; col += 1) {
        const bucket = broadphase[row * broadCols + col];
        for (let i = 0; i < bucket.length; i += 1) {
          const index = bucket[i];
          if (solidStamp[index] === solidTick) continue;
          solidStamp[index] = solidTick;
          out.push(solids[index]);
        }
      }
    }
    return out;
  }

  /* —— 合批出网格 —— */
  const staticMeshes = [];
  batches.forEach((batch, key) => {
    if (batch.vertices === 0) return;
    const family = batch.family;
    const spec = SurfaceFamilies[family];
    const material = art.MakeVariant(spec.key, 'WorldMerged_' + family, { vertexColors: true, color: 0xffffff });
    const geometry = FinishBatch(batch);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'MeshWorld_' + key;
    mesh.castShadow = spec.shadow;
    mesh.receiveShadow = true;
    if (DetailFamilies[family] !== undefined) {
      mesh.userData.cullDistance = DetailFamilies[family];
      mesh.userData.centre = geometry.boundingSphere ? geometry.boundingSphere.center.clone() : new THREE.Vector3();
      mesh.userData.radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 0;
    }
    group.add(mesh);
    staticMeshes.push(mesh);
    ownedGeometry.push(geometry);
  });
  batches.clear();
  const instancedMeshes = FinishInstances();

  /* —— 天空开阔度：巷子里、屋檐下、岩缝中天然更暗，潜行更好藏 —— */
  const openStep = 2.0;
  const openCols = Math.max(1, Math.ceil(spanX / openStep));
  const openRows = Math.max(1, Math.ceil(spanZ / openStep));
  const openGrid = new Float32Array(openCols * openRows);
  const openScratch = [];
  for (let row = 0; row < openRows; row += 1) {
    for (let col = 0; col < openCols; col += 1) {
      const x = bounds.minX + (col + 0.5) * openStep;
      const z = bounds.minZ + (row + 0.5) * openStep;
      const groundY = SampleHeight(x, z);
      let open = 1;
      QuerySolids(x - 3.2, z - 3.2, x + 3.2, z + 3.2, openScratch);
      for (let i = 0; i < openScratch.length; i += 1) {
        const s = openScratch[i];
        if (s.maxY < groundY + 1.9) continue;
        if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) { open -= 0.6; continue; }
        const dx = Math.max(s.minX - x, 0, x - s.maxX);
        const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 3.2) open -= 0.14 * (1 - distance / 3.2) * MathUtil.Clamp01((s.maxY - groundY - 1.5) / 2.5);
      }
      openGrid[row * openCols + col] = MathUtil.Clamp01(open);
    }
  }
  function SampleOpenness(x, z) {
    const col = MathUtil.Clamp(Math.floor((x - bounds.minX) / openStep), 0, openCols - 1);
    const row = MathUtil.Clamp(Math.floor((z - bounds.minZ) / openStep), 0, openRows - 1);
    return openGrid[row * openCols + col];
  }

  /* —— 掩体空间索引 —— */
  const coverCell = 8;
  const coverCols = Math.max(1, Math.ceil(spanX / coverCell));
  const coverRows = Math.max(1, Math.ceil(spanZ / coverCell));
  const coverGrid = new Array(coverCols * coverRows);
  for (let i = 0; i < coverGrid.length; i += 1) coverGrid[i] = [];
  for (let i = 0; i < covers.length; i += 1) {
    const c = covers[i];
    const col = MathUtil.Clamp(Math.floor((c.position.x - bounds.minX) / coverCell), 0, coverCols - 1);
    const row = MathUtil.Clamp(Math.floor((c.position.z - bounds.minZ) / coverCell), 0, coverRows - 1);
    coverGrid[row * coverCols + col].push(c);
  }

  /* ---------------------------------------------------------------- *
   * 6.15 导航网格 + A*
   * ---------------------------------------------------------------- */

  const navStep = WorldConfig.navGridStep;
  const navCols = Math.max(4, Math.round(spanX / navStep));
  const navRows = Math.max(4, Math.round(spanZ / navStep));
  const navBlocked = new Uint8Array(navCols * navRows);
  const navCost = new Float32Array(navCols * navRows);
  const agentRadius = 0.42;

  function NavIndex(col, row) { return row * navCols + col; }
  function NavToWorldX(col) { return bounds.minX + (col + 0.5) * navStep; }
  function NavToWorldZ(row) { return bounds.minZ + (row + 0.5) * navStep; }
  function WorldToNavCol(x) { return MathUtil.Clamp(Math.floor((x - bounds.minX) / navStep), 0, navCols - 1); }
  function WorldToNavRow(z) { return MathUtil.Clamp(Math.floor((z - bounds.minZ) / navStep), 0, navRows - 1); }

  for (let row = 0; row < navRows; row += 1) {
    for (let col = 0; col < navCols; col += 1) {
      const x = NavToWorldX(col);
      const z = NavToWorldZ(row);
      const steep = TerrainSteep(x, z);
      const index = NavIndex(col, row);
      navBlocked[index] = steep > 0.95 ? 1 : 0;
      /* 走路的人爱走踩实的路，坡上和深雪里慢 */
      navCost[index] = 1 + steep * 0.9 - SampleLane(x, z) * 0.35;
    }
  }
  const navScratch = [];
  for (let row = 0; row < navRows; row += 1) {
    for (let col = 0; col < navCols; col += 1) {
      const index = NavIndex(col, row);
      if (navBlocked[index]) continue;
      const x = NavToWorldX(col);
      const z = NavToWorldZ(row);
      const groundY = SampleHeight(x, z);
      QuerySolids(x - agentRadius, z - agentRadius, x + agentRadius, z + agentRadius, navScratch);
      for (let i = 0; i < navScratch.length; i += 1) {
        const s = navScratch[i];
        if (!s.block) continue;
        if (s.maxY < groundY + 0.42) continue;
        if (s.minY > groundY + 1.7) continue;
        const dx = x - s.cx;
        const dz = z - s.cz;
        const lx = Math.abs(dx * s.cos - dz * s.sin);
        const lz = Math.abs(dx * s.sin + dz * s.cos);
        if (lx < s.hx + agentRadius && lz < s.hz + agentRadius) { navBlocked[index] = 1; break; }
      }
    }
  }

  const pathHeap = CreateHeap();
  const pathCost = new Float32Array(navCols * navRows);
  const pathFrom = new Int32Array(navCols * navRows);
  const pathTouched = new Int32Array(navCols * navRows);
  let pathStamp = 0;
  const pathRaw = [];

  function IsNavigableIndex(col, row) {
    if (col < 0 || row < 0 || col >= navCols || row >= navRows) return false;
    return navBlocked[NavIndex(col, row)] === 0;
  }

  function NavLineClear(x0, z0, x1, z1) {
    const distance = MathUtil.Distance2(x0, z0, x1, z1);
    const steps = Math.max(2, Math.ceil(distance / (navStep * 0.65)));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (!IsNavigableIndex(WorldToNavCol(x), WorldToNavRow(z))) return false;
    }
    return true;
  }

  function FindNearestNavIndex(x, z) {
    const startCol = WorldToNavCol(x);
    const startRow = WorldToNavRow(z);
    if (IsNavigableIndex(startCol, startRow)) return NavIndex(startCol, startRow);
    for (let ring = 1; ring < 14; ring += 1) {
      for (let dRow = -ring; dRow <= ring; dRow += 1) {
        for (let dCol = -ring; dCol <= ring; dCol += 1) {
          if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;
          if (IsNavigableIndex(startCol + dCol, startRow + dRow)) return NavIndex(startCol + dCol, startRow + dRow);
        }
      }
    }
    return -1;
  }

  function FindPath(fromVec3, toVec3, out) {
    const result = out || [];
    result.length = 0;
    const startIndex = FindNearestNavIndex(fromVec3.x, fromVec3.z);
    const goalIndex = FindNearestNavIndex(toVec3.x, toVec3.z);
    if (startIndex < 0 || goalIndex < 0) { result.push({ x: toVec3.x, z: toVec3.z }); return result; }
    if (startIndex === goalIndex) { result.push({ x: toVec3.x, z: toVec3.z }); return result; }
    const goalCol = goalIndex % navCols;
    const goalRow = (goalIndex - goalCol) / navCols;
    pathStamp += 1;
    pathHeap.Clear();
    pathCost[startIndex] = 0;
    pathFrom[startIndex] = -1;
    pathTouched[startIndex] = pathStamp;
    pathHeap.Push(startIndex, 0);
    let found = false;
    let expanded = 0;
    while (pathHeap.size > 0 && expanded < 4200) {
      const current = pathHeap.Pop();
      if (current === goalIndex) { found = true; break; }
      expanded += 1;
      const col = current % navCols;
      const row = (current - col) / navCols;
      for (let dRow = -1; dRow <= 1; dRow += 1) {
        for (let dCol = -1; dCol <= 1; dCol += 1) {
          if (dCol === 0 && dRow === 0) continue;
          const nextCol = col + dCol;
          const nextRow = row + dRow;
          if (!IsNavigableIndex(nextCol, nextRow)) continue;
          /* 斜穿不许贴着墙角切过去 */
          if (dCol !== 0 && dRow !== 0
            && (!IsNavigableIndex(nextCol, row) || !IsNavigableIndex(col, nextRow))) continue;
          const nextIndex = NavIndex(nextCol, nextRow);
          const step = (dCol !== 0 && dRow !== 0) ? 1.41421 : 1;
          const tentative = pathCost[current] + step * navCost[nextIndex];
          if (pathTouched[nextIndex] === pathStamp && tentative >= pathCost[nextIndex]) continue;
          pathTouched[nextIndex] = pathStamp;
          pathCost[nextIndex] = tentative;
          pathFrom[nextIndex] = current;
          const hCol = Math.abs(nextCol - goalCol);
          const hRow = Math.abs(nextRow - goalRow);
          const heuristic = (hCol + hRow) + (1.41421 - 2) * Math.min(hCol, hRow);
          pathHeap.Push(nextIndex, tentative + heuristic * 1.35);
        }
      }
    }
    if (!found) { result.push({ x: toVec3.x, z: toVec3.z }); return result; }
    pathRaw.length = 0;
    let cursor = goalIndex;
    let guard = 0;
    while (cursor >= 0 && guard < 6000) {
      const col = cursor % navCols;
      const row = (cursor - col) / navCols;
      pathRaw.push(NavToWorldX(col), NavToWorldZ(row));
      cursor = pathFrom[cursor];
      guard += 1;
    }
    /* 拉绳：把网格的锯齿抹掉，AI 才不会走出一条楼梯 */
    const points = [];
    for (let i = pathRaw.length - 2; i >= 0; i -= 2) points.push(pathRaw[i], pathRaw[i + 1]);
    let index = 0;
    result.push({ x: points[0], z: points[1] });
    while (index < points.length / 2 - 1) {
      let far = index + 1;
      for (let probe = points.length / 2 - 1; probe > index; probe -= 1) {
        if (NavLineClear(points[index * 2], points[index * 2 + 1], points[probe * 2], points[probe * 2 + 1])) {
          far = probe; break;
        }
      }
      result.push({ x: points[far * 2], z: points[far * 2 + 1] });
      index = far;
    }
    result[result.length - 1] = { x: toVec3.x, z: toVec3.z };
    return result;
  }

  /* ---------------------------------------------------------------- *
   * 6.16 出生点
   * ---------------------------------------------------------------- */

  function IsSpotClear(x, z, clearance) {
    if (!IsInsideBounds(x, z)) return false;
    if (TerrainSteep(x, z) > 0.7) return false;
    QuerySolids(x - clearance, z - clearance, x + clearance, z + clearance, navScratch);
    const groundY = SampleHeight(x, z);
    for (let i = 0; i < navScratch.length; i += 1) {
      const s = navScratch[i];
      if (!s.block) continue;
      if (s.maxY < groundY + 0.3) continue;
      const dx = x - s.cx;
      const dz = z - s.cz;
      const lx = Math.abs(dx * s.cos - dz * s.sin);
      const lz = Math.abs(dx * s.sin + dz * s.cos);
      if (lx < s.hx + clearance && lz < s.hz + clearance) return false;
    }
    return true;
  }

  function FindClearSpot(preferX, preferZ, clearance) {
    if (IsSpotClear(preferX, preferZ, clearance)) return { x: preferX, z: preferZ };
    for (let ring = 1; ring < 24; ring += 1) {
      const samples = ring * 6;
      for (let i = 0; i < samples; i += 1) {
        const angle = (i / samples) * MathUtil.Tau;
        const x = preferX + Math.cos(angle) * ring * 1.1;
        const z = preferZ + Math.sin(angle) * ring * 1.1;
        if (IsSpotClear(x, z, clearance)) return { x: x, z: z };
      }
    }
    return { x: preferX, z: preferZ };
  }

  /* 出生点永远落在主动线正中：第一步就踩在「该走的路」上 */
  const startZ = preset === 'Village' ? 55.0 : (preset === 'Valley' ? 65.0 : 61.0);
  const startQuery = QueryRoute(route, 0, startZ);
  const startSpot = FindClearSpot(startQuery.cx, startQuery.cz, 1.5);
  /* 三幕统一：南边进，北边出。开场朝北，第一眼就是本幕的地标。 */
  const startYaw = 0;
  const companionSpot = FindClearSpot(startSpot.x - 1.7, startSpot.z + 1.9, 0.7);

  const spawns = {
    playerStart: { position: new THREE.Vector3(startSpot.x, SampleHeight(startSpot.x, startSpot.z), startSpot.z),
      yaw: startYaw },
    companionStart: { position: new THREE.Vector3(companionSpot.x,
      SampleHeight(companionSpot.x, companionSpot.z), companionSpot.z), yaw: startYaw },
    enemyPosts: enemyPosts,
    lootSpots: lootSpots,
    storyAnchors: storyAnchors,
    patrolRoutes: patrolRoutes,
    coverPoints: covers.map((cover) => cover.position.clone()),
    fireSpots: fireSpots,
  };
  AddAnchor('AnchorPlayerStart', startSpot.x, startSpot.z, 3, startYaw);

  /* ---------------------------------------------------------------- *
   * 6.17 查询实现
   * ---------------------------------------------------------------- */

  const lastContact = { hit: false, normal: new THREE.Vector3(0, 1, 0), surface: 'Snow', blocked: false };
  const footprints = [];
  const moveScratch = [];
  const rayScratch = [];
  const senseScratch = [];
  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const maxClimbSlope = 1.05;

  function Climbable(x0, z0, x1, z1) {
    const distance = MathUtil.Distance2(x0, z0, x1, z1);
    if (distance < 1e-5) return true;
    const rise = SampleHeight(x1, z1) - SampleHeight(x0, z0);
    return rise <= distance * maxClimbSlope + 0.06;
  }

  function ResolveMove(from, to, radius, out) {
    const target = out || new THREE.Vector3();
    const stepHeight = Config.Player.stepHeight;
    const bodyHeight = Config.Player.crouchHeight;
    let x = to.x;
    let z = to.z;
    const feet = Math.max(from.y, SampleHeight(from.x, from.z) - 0.05);
    lastContact.hit = false;
    lastContact.blocked = false;

    /* 陡坡爬不上去：先试整段，再试单轴，最后原地不动。滑行感由此而来。 */
    if (!Climbable(from.x, from.z, x, z)) {
      if (Climbable(from.x, from.z, x, from.z)) z = from.z;
      else if (Climbable(from.x, from.z, from.x, z)) x = from.x;
      else { x = from.x; z = from.z; }
    }

    let stepFloor = -Infinity;
    let blocked = false;
    for (let pass = 0; pass < 3; pass += 1) {
      QuerySolids(x - radius, z - radius, x + radius, z + radius, moveScratch);
      let touched = false;
      for (let i = 0; i < moveScratch.length; i += 1) {
        const s = moveScratch[i];
        if (!s.block) continue;
        const dx = x - s.cx;
        const dz = z - s.cz;
        const lx = dx * s.cos - dz * s.sin;
        const lz = dx * s.sin + dz * s.cos;
        const clampedX = MathUtil.Clamp(lx, -s.hx, s.hx);
        const clampedZ = MathUtil.Clamp(lz, -s.hz, s.hz);
        const ox = lx - clampedX;
        const oz = lz - clampedZ;
        const distanceSq = ox * ox + oz * oz;
        if (distanceSq >= radius * radius) continue;
        if (s.maxY <= feet + stepHeight) {
          /* 矮的东西是台阶：踩上去，不挡路 */
          if (s.maxY > stepFloor) stepFloor = s.maxY;
          continue;
        }
        if (s.minY >= feet + bodyHeight) continue;
        blocked = true;
        touched = true;
        lastContact.hit = true;
        lastContact.surface = s.surface;
        let distance = Math.sqrt(distanceSq);
        let nx; let nz;
        if (distance > 1e-5) { nx = ox / distance; nz = oz / distance; }
        else {
          const penX = s.hx - Math.abs(lx);
          const penZ = s.hz - Math.abs(lz);
          if (penX < penZ) { nx = lx >= 0 ? 1 : -1; nz = 0; distance = -penX; }
          else { nx = 0; nz = lz >= 0 ? 1 : -1; distance = -penZ; }
        }
        const push = radius - distance;
        const wx = nx * s.cos + nz * s.sin;
        const wz = -nx * s.sin + nz * s.cos;
        x += wx * push;
        z += wz * push;
        lastContact.normal.set(wx, 0, wz);
      }
      if (!touched) break;
    }

    x = MathUtil.Clamp(x, bounds.minX + radius + 0.5, bounds.maxX - radius - 0.5);
    z = MathUtil.Clamp(z, bounds.minZ + radius + 0.5, bounds.maxZ - radius - 0.5);
    let finalY = SampleHeight(x, z);
    if (stepFloor > finalY) finalY = stepFloor;
    /* 下台阶不瞬移：单次最多落 0.3m，60Hz 下就是一条平滑的下落曲线 */
    if (finalY < feet - 0.30) finalY = feet - 0.30;
    lastContact.blocked = blocked;
    return target.set(x, finalY, z);
  }

  /** 线段 vs OBB。返回命中距离或 -1。 */
  function RaySolid(s, ox, oy, oz, dx, dy, dz, maxDistance) {
    const rx = ox - s.cx;
    const rz = oz - s.cz;
    const lox = rx * s.cos - rz * s.sin;
    const loz = rx * s.sin + rz * s.cos;
    const loy = oy - s.cy;
    const ldx = dx * s.cos - dz * s.sin;
    const ldz = dx * s.sin + dz * s.cos;
    let near = 0;
    let far = maxDistance;
    const origin = [lox, loy, loz];
    const direction = [ldx, dy, ldz];
    const half = [s.hx, s.hy, s.hz];
    for (let axis = 0; axis < 3; axis += 1) {
      const d = direction[axis];
      const o = origin[axis];
      if (Math.abs(d) < 1e-8) {
        if (o < -half[axis] || o > half[axis]) return -1;
        continue;
      }
      const inverse = 1 / d;
      let t0 = (-half[axis] - o) * inverse;
      let t1 = (half[axis] - o) * inverse;
      if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
      if (t0 > near) near = t0;
      if (t1 < far) far = t1;
      if (near > far) return -1;
    }
    return near;
  }

  function SolidNormalAt(s, x, y, z, out) {
    const dx = x - s.cx;
    const dz = z - s.cz;
    const lx = dx * s.cos - dz * s.sin;
    const lz = dx * s.sin + dz * s.cos;
    const ly = y - s.cy;
    const px = s.hx - Math.abs(lx);
    const py = s.hy - Math.abs(ly);
    const pz = s.hz - Math.abs(lz);
    let nx = 0; let ny = 0; let nz = 0;
    if (px <= py && px <= pz) nx = lx >= 0 ? 1 : -1;
    else if (py <= pz) ny = ly >= 0 ? 1 : -1;
    else nz = lz >= 0 ? 1 : -1;
    return out.set(nx * s.cos + nz * s.sin, ny, -nx * s.sin + nz * s.cos);
  }

  function QuerySegment(fromX, fromZ, toX, toZ, out) {
    return QuerySolids(Math.min(fromX, toX) - 0.5, Math.min(fromZ, toZ) - 0.5,
      Math.max(fromX, toX) + 0.5, Math.max(fromZ, toZ) + 0.5, out);
  }

  function Raycast(origin, direction, maxDistance) {
    let bestDistance = maxDistance;
    let bestSolid = null;
    QuerySegment(origin.x, origin.z, origin.x + direction.x * maxDistance,
      origin.z + direction.z * maxDistance, rayScratch);
    for (let i = 0; i < rayScratch.length; i += 1) {
      const distance = RaySolid(rayScratch[i], origin.x, origin.y, origin.z,
        direction.x, direction.y, direction.z, bestDistance);
      if (distance >= 0 && distance < bestDistance) { bestDistance = distance; bestSolid = rayScratch[i]; }
    }
    /* 地形：粗步进 + 二分收敛 */
    let groundDistance = -1;
    const stepCount = 40;
    let previous = origin.y - SampleHeight(origin.x, origin.z);
    for (let i = 1; i <= stepCount; i += 1) {
      const t = (i / stepCount) * maxDistance;
      const px = origin.x + direction.x * t;
      const py = origin.y + direction.y * t;
      const pz = origin.z + direction.z * t;
      const delta = py - SampleHeight(px, pz);
      if (previous > 0 && delta <= 0) {
        let low = ((i - 1) / stepCount) * maxDistance;
        let high = t;
        for (let k = 0; k < 8; k += 1) {
          const mid = (low + high) * 0.5;
          if (origin.y + direction.y * mid - SampleHeight(origin.x + direction.x * mid,
            origin.z + direction.z * mid) > 0) low = mid; else high = mid;
        }
        groundDistance = (low + high) * 0.5;
        break;
      }
      previous = delta;
    }
    if (groundDistance >= 0 && (bestSolid === null || groundDistance < bestDistance)) {
      const point = new THREE.Vector3(origin.x + direction.x * groundDistance,
        origin.y + direction.y * groundDistance, origin.z + direction.z * groundDistance);
      return { point: point, normal: TerrainNormal(point.x, point.z, new THREE.Vector3()),
        distance: groundDistance, surface: SampleGroundKind(point.x, point.z), objectKind: 'Terrain' };
    }
    if (!bestSolid) return null;
    const point = new THREE.Vector3(origin.x + direction.x * bestDistance,
      origin.y + direction.y * bestDistance, origin.z + direction.z * bestDistance);
    return { point: point, normal: SolidNormalAt(bestSolid, point.x, point.y, point.z, new THREE.Vector3()),
      distance: bestDistance, surface: bestSolid.surface, objectKind: bestSolid.kind };
  }

  /** 视线：草垛、断墙、岩壁挡；篱笆、铁丝网、树枝不挡。 */
  function HasLineOfSight(fromVec3, toVec3) {
    const dx = toVec3.x - fromVec3.x;
    const dy = toVec3.y - fromVec3.y;
    const dz = toVec3.z - fromVec3.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 1e-4) return true;
    const nx = dx / distance; const ny = dy / distance; const nz = dz / distance;
    QuerySegment(fromVec3.x, fromVec3.z, toVec3.x, toVec3.z, senseScratch);
    for (let i = 0; i < senseScratch.length; i += 1) {
      const s = senseScratch[i];
      if (s.sight < 0.6) continue;
      const hit = RaySolid(s, fromVec3.x, fromVec3.y, fromVec3.z, nx, ny, nz, distance);
      if (hit >= 0 && hit < distance - 0.05) return false;
    }
    const samples = MathUtil.Clamp(Math.round(distance / 1.6), 3, 22);
    for (let i = 1; i < samples; i += 1) {
      const t = i / samples;
      if (fromVec3.y + dy * t < SampleHeight(fromVec3.x + dx * t, fromVec3.z + dz * t) - 0.12) return false;
    }
    return true;
  }

  /** 部分遮挡：只看到半个身子的时候，返回 0.33 而不是 0 或 1。 */
  function SampleVisibility(fromVec3, toVec3, targetRadius) {
    const radius = targetRadius === undefined ? 0.34 : targetRadius;
    let blockedWeight = 0;
    const offsets = [0.75, 0, -0.55];
    for (let i = 0; i < offsets.length; i += 1) {
      scratchB.set(toVec3.x + (i === 1 ? radius * 0.6 : 0), toVec3.y + offsets[i], toVec3.z);
      if (!HasLineOfSight(fromVec3, scratchB)) blockedWeight += 1;
    }
    let partial = 0;
    QuerySegment(fromVec3.x, fromVec3.z, toVec3.x, toVec3.z, senseScratch);
    const dx = toVec3.x - fromVec3.x;
    const dy = toVec3.y - fromVec3.y;
    const dz = toVec3.z - fromVec3.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
    for (let i = 0; i < senseScratch.length; i += 1) {
      const s = senseScratch[i];
      if (s.sight >= 0.6 || s.sight <= 0.02) continue;
      const hit = RaySolid(s, fromVec3.x, fromVec3.y, fromVec3.z, dx / distance, dy / distance, dz / distance, distance);
      if (hit >= 0 && hit < distance) partial = Math.max(partial, s.sight);
    }
    return MathUtil.Clamp01(blockedWeight / offsets.length + partial * 0.5);
  }

  /** 噪音穿墙衰减：墙厚、地窖深、雪堆软，各算各的。 */
  function SampleOcclusion(fromVec3, toVec3) {
    const dx = toVec3.x - fromVec3.x;
    const dy = toVec3.y - fromVec3.y;
    const dz = toVec3.z - fromVec3.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 1e-4) return 0;
    const nx = dx / distance; const ny = dy / distance; const nz = dz / distance;
    QuerySegment(fromVec3.x, fromVec3.z, toVec3.x, toVec3.z, senseScratch);
    let occlusion = 0;
    for (let i = 0; i < senseScratch.length; i += 1) {
      const s = senseScratch[i];
      if (s.sound <= 0.01) continue;
      const hit = RaySolid(s, fromVec3.x, fromVec3.y, fromVec3.z, nx, ny, nz, distance);
      if (hit >= 0 && hit < distance) occlusion = 1 - (1 - occlusion) * (1 - s.sound * 0.75);
    }
    if (IsIndoors(fromVec3) !== IsIndoors(toVec3)) {
      occlusion = 1 - (1 - occlusion) * (1 - WorldConfig.occlusionIndoor * 0.5);
    }
    return MathUtil.Clamp01(occlusion);
  }

  function IsIndoors(position) {
    for (let i = 0; i < rooms.length; i += 1) {
      const room = rooms[i];
      if (!room.roofed) continue;
      const dx = position.x - room.cx;
      const dz = position.z - room.cz;
      const lx = Math.abs(dx * room.cos - dz * room.sin);
      const lz = Math.abs(dx * room.sin + dz * room.cos);
      if (lx < room.hx && lz < room.hz) return true;
    }
    return false;
  }

  /** 藏匿度：草垛 / 断墙后 / 雪窝 / 阴影 + 蹲伏姿态。 */
  function SampleConcealment(position, crouched, prone) {
    let concealment = 0;
    for (let i = 0; i < concealers.length; i += 1) {
      const c = concealers[i];
      const distance = MathUtil.Distance2(position.x, position.z, c.x, c.z);
      if (distance > c.radius) continue;
      concealment = Math.max(concealment, c.strength * (1 - distance / c.radius));
    }
    QuerySolids(position.x - 2.2, position.z - 2.2, position.x + 2.2, position.z + 2.2, senseScratch);
    for (let i = 0; i < senseScratch.length; i += 1) {
      const s = senseScratch[i];
      const distance = Math.max(0, Math.sqrt(
        Math.pow(Math.max(s.minX - position.x, 0, position.x - s.maxX), 2)
        + Math.pow(Math.max(s.minZ - position.z, 0, position.z - s.maxZ), 2)));
      if (distance > 1.6) continue;
      const nearBonus = (1 - distance / 1.6);
      if (s.conceal > 0) concealment = Math.max(concealment, s.conceal * nearBonus);
      else if (s.sight > 0.6 && s.maxY - s.minY > 0.8) {
        concealment = Math.max(concealment, Config.Stealth.concealmentCoverBonus * nearBonus * 0.8);
      }
    }
    concealment += (1 - SampleOpenness(position.x, position.z)) * 0.22;
    if (prone) concealment += Config.Stealth.concealmentProneBonus;
    else if (crouched) concealment += Config.Stealth.concealmentCrouchBonus;
    return MathUtil.Clamp01(concealment);
  }

  function GetLightLevel(position) {
    let level = art && art.GetAmbientLightLevel ? art.GetAmbientLightLevel(position) : 0.5;
    level *= 0.42 + SampleOpenness(position.x, position.z) * 0.58;
    if (IsIndoors(position)) level *= 0.45;
    return MathUtil.Clamp01(level);
  }

  /* ---------------------------------------------------------------- *
   * 6.18 可动件绑定 / 烟 / 剔除
   * ---------------------------------------------------------------- */

  const moverBinding = {
    InteractableCellarDoor: 'CellarDoor',
    InteractableCheckpointBar: 'CheckpointBar',
  };

  function SetMoverOpen(moverId, open) {
    for (let i = 0; i < movers.length; i += 1) {
      if (movers[i].id !== moverId) continue;
      movers[i].target = open ? movers[i].openYaw : movers[i].baseYaw;
      return true;
    }
    return false;
  }

  let smokeTimer = 0;
  const smokePosition = new THREE.Vector3();

  /* ---------------------------------------------------------------- *
   * 6.19 公开 API
   * ---------------------------------------------------------------- */

  const world = {
    group: group,
    chapterId: chapterId,
    preset: preset,
    bounds: bounds,
    covers: covers,
    interactables: interactables,
    spawns: spawns,

    /* —— 地形采样 —— */
    SampleHeight: SampleHeight,
    SampleSlope(x, z) {
      TerrainNormal(x, z, scratchB);
      return Math.acos(MathUtil.Clamp(scratchB.y, -1, 1));
    },
    SampleNormal(x, z, out) { return TerrainNormal(x, z, out || new THREE.Vector3()); },
    SampleGroundKind: SampleGroundKind,
    IsInsideBounds: IsInsideBounds,

    /* —— 移动与碰撞 —— */
    ResolveMove: ResolveMove,
    GetLastMoveContact() { return lastContact; },
    IsPositionFree(position, radius, height) {
      QuerySolids(position.x - radius, position.z - radius, position.x + radius, position.z + radius, moveScratch);
      const span = height === undefined ? 1.8 : height;
      for (let i = 0; i < moveScratch.length; i += 1) {
        const s = moveScratch[i];
        if (!s.block) continue;
        if (s.maxY < position.y + 0.15 || s.minY > position.y + span) continue;
        const dx = position.x - s.cx;
        const dz = position.z - s.cz;
        const lx = Math.abs(dx * s.cos - dz * s.sin);
        const lz = Math.abs(dx * s.sin + dz * s.cos);
        if (lx < s.hx + radius && lz < s.hz + radius) return false;
      }
      return true;
    },
    SnapToGround(position, out) {
      const target = out || new THREE.Vector3();
      return target.set(position.x, SampleHeight(position.x, position.z), position.z);
    },
    Raycast: Raycast,

    /* —— 感知支持 —— */
    HasLineOfSight: HasLineOfSight,
    SampleVisibility: SampleVisibility,
    SampleOcclusion: SampleOcclusion,
    SampleConcealment: SampleConcealment,
    GetLightLevel: GetLightLevel,
    IsIndoors: IsIndoors,

    /* —— 导航 —— */
    FindPath: FindPath,
    FindNearestNavPoint(position, out) {
      const target = out || {};
      const index = FindNearestNavIndex(position.x, position.z);
      if (index < 0) { target.x = position.x; target.z = position.z; return target; }
      const col = index % navCols;
      const row = (index - col) / navCols;
      target.x = NavToWorldX(col);
      target.z = NavToWorldZ(row);
      return target;
    },
    IsNavigable(x, z) {
      if (!IsInsideBounds(x, z)) return false;
      return navBlocked[NavIndex(WorldToNavCol(x), WorldToNavRow(z))] === 0;
    },
    FindRetreatPoint(origin, threat, minDistance) {
      scratchA.set(origin.x - threat.x, 0, origin.z - threat.z);
      if (scratchA.lengthSq() < 1e-4) scratchA.set(1, 0, 0);
      scratchA.normalize();
      for (let i = 0; i < 12; i += 1) {
        const angle = (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2) * 0.42;
        const dirX = scratchA.x * Math.cos(angle) - scratchA.z * Math.sin(angle);
        const dirZ = scratchA.x * Math.sin(angle) + scratchA.z * Math.cos(angle);
        for (let scale = 1; scale >= 0.5; scale -= 0.25) {
          const x = origin.x + dirX * minDistance * scale;
          const z = origin.z + dirZ * minDistance * scale;
          if (world.IsNavigable(x, z)) return new THREE.Vector3(x, SampleHeight(x, z), z);
        }
      }
      return null;
    },
    FindFlankPoint(origin, target, side, maxDistance) {
      scratchA.set(target.x - origin.x, 0, target.z - origin.z);
      const distance = Math.min(maxDistance, Math.max(2, scratchA.length()));
      scratchA.normalize();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const reach = distance * (1 - attempt * 0.2);
        const x = origin.x + (-scratchA.z * side) * reach * 0.75 + scratchA.x * reach * 0.45;
        const z = origin.z + (scratchA.x * side) * reach * 0.75 + scratchA.z * reach * 0.45;
        if (world.IsNavigable(x, z)) return new THREE.Vector3(x, SampleHeight(x, z), z);
      }
      return null;
    },
    SampleSearchPoints(center, radius, count) {
      const points = [];
      const wanted = count || 3;
      for (let i = 0; i < wanted * 8 && points.length < wanted; i += 1) {
        const angle = (i / wanted) * MathUtil.Tau + MathUtil.Hash1(i * 3.7) * 1.4;
        const distance = radius * (0.30 + MathUtil.Hash1(i * 5.1) * 0.7);
        const x = center.x + Math.cos(angle) * distance;
        const z = center.z + Math.sin(angle) * distance;
        if (!world.IsNavigable(x, z)) continue;
        let tooClose = false;
        for (let k = 0; k < points.length; k += 1) {
          if (MathUtil.Distance2(x, z, points[k].x, points[k].z) < radius * 0.45) { tooClose = true; break; }
        }
        if (tooClose) continue;
        points.push(new THREE.Vector3(x, SampleHeight(x, z), z));
      }
      return points;
    },

    /* —— 掩体 —— */
    GetCoversNear(position, radius) {
      const list = [];
      const colMin = MathUtil.Clamp(Math.floor((position.x - radius - bounds.minX) / coverCell), 0, coverCols - 1);
      const colMax = MathUtil.Clamp(Math.floor((position.x + radius - bounds.minX) / coverCell), 0, coverCols - 1);
      const rowMin = MathUtil.Clamp(Math.floor((position.z - radius - bounds.minZ) / coverCell), 0, coverRows - 1);
      const rowMax = MathUtil.Clamp(Math.floor((position.z + radius - bounds.minZ) / coverCell), 0, coverRows - 1);
      for (let row = rowMin; row <= rowMax; row += 1) {
        for (let col = colMin; col <= colMax; col += 1) {
          const bucket = coverGrid[row * coverCols + col];
          for (let i = 0; i < bucket.length; i += 1) {
            if (bucket[i].position.distanceTo(position) <= radius) list.push(bucket[i]);
          }
        }
      }
      return list;
    },
    FindCover(fromVec3, threatVec3, maxDistance) {
      const candidates = world.GetCoversNear(fromVec3, maxDistance);
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < candidates.length; i += 1) {
        const cover = candidates[i];
        if (cover.occupiedBy) continue;
        const distance = cover.position.distanceTo(fromVec3);
        /* 掩体的 forward 指向「威胁应该在的那一侧」；背对威胁的掩体才算数 */
        const toThreatX = threatVec3.x - cover.position.x;
        const toThreatZ = threatVec3.z - cover.position.z;
        const length = Math.sqrt(toThreatX * toThreatX + toThreatZ * toThreatZ) || 1;
        const facing = (toThreatX / length) * cover.forward.x + (toThreatZ / length) * cover.forward.z;
        if (facing < 0.15) continue;
        const shielding = cover.position.distanceTo(threatVec3);
        const score = facing * 6 + Math.min(shielding, 26) * 0.35 - distance * 0.8
          + (cover.height > WorldConfig.coverHighHeight ? 1.5 : 0);
        if (score > bestScore) { bestScore = score; best = cover; }
      }
      return best;
    },
    ClaimCover(coverId, ownerId) {
      for (let i = 0; i < covers.length; i += 1) {
        if (covers[i].id !== coverId) continue;
        if (covers[i].occupiedBy && covers[i].occupiedBy !== ownerId) return false;
        covers[i].occupiedBy = ownerId;
        return true;
      }
      return false;
    },
    ReleaseCover(coverId, ownerId) {
      for (let i = 0; i < covers.length; i += 1) {
        if (covers[i].id === coverId && covers[i].occupiedBy === ownerId) covers[i].occupiedBy = null;
      }
    },

    /* —— 交互物 —— */
    RegisterInteractable: RegisterInteractable,
    QueryInteractable(position, forward, maxDistance) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < interactables.length; i += 1) {
        const item = interactables[i];
        if (item.state === 'Used' || item.state === 'Broken') continue;
        scratchA.subVectors(item.position, position);
        const rise = scratchA.y;
        if (rise > 2.2 || rise < -2.2) continue;
        scratchA.y = 0;
        const distance = scratchA.length();
        if (distance > maxDistance) continue;
        if (distance > 1e-4) scratchA.multiplyScalar(1 / distance);
        const facing = forward ? (scratchA.x * forward.x + scratchA.z * forward.z) : 1;
        if (facing < 0.1 && distance > 0.9) continue;
        const score = facing * 2.2 - distance * 0.45 + (item.kind === 'Door' ? 0.4 : 0);
        if (score > bestScore) { bestScore = score; best = item; }
      }
      return best;
    },
    SetInteractableState(id, state) {
      const item = interactableIndex.get(id);
      if (!item) return false;
      item.state = state;
      const moverId = moverBinding[id];
      if (moverId) SetMoverOpen(moverId, state === 'Open' || state === 'Used');
      return true;
    },
    SetDoorOpen(doorId, open) {
      const item = interactableIndex.get(doorId);
      if (!item) return false;
      item.state = open ? 'Open' : 'Idle';
      const moverId = moverBinding[doorId];
      if (moverId) SetMoverOpen(moverId, open);
      return true;
    },

    /* —— 触发体 —— */
    QueryTriggers(position, radius) {
      const list = [];
      const keys = Object.keys(storyAnchors);
      for (let i = 0; i < keys.length; i += 1) {
        const anchor = storyAnchors[keys[i]];
        if (MathUtil.Distance2(position.x, position.z, anchor.position.x, anchor.position.z)
          <= anchor.radius + radius) {
          list.push({ id: keys[i], kind: 'Anchor', payload: { radius: anchor.radius } });
        }
      }
      for (let i = 0; i < triggerZones.length; i += 1) {
        const zone = triggerZones[i];
        if (MathUtil.Distance2(position.x, position.z, zone.x, zone.z) <= zone.radius + radius) {
          list.push({ id: zone.id, kind: zone.kind, payload: zone.payload });
        }
      }
      return list;
    },

    /* —— 雪地脚印 —— */
    StampFootprint(position, forward, ownerId, surface) {
      const kind = surface || SampleGroundKind(position.x, position.z);
      /* 石头和冰面上不留脚印——留下痕迹这件事本身就是雪地的规则 */
      if (kind !== 'Snow' && kind !== 'Dirt' && kind !== 'Straw') return;
      const print = {
        position: position.clone(),
        forward: forward ? forward.clone() : new THREE.Vector3(0, 0, 1),
        ownerId: ownerId || 'Unknown',
        age: 0,
        surface: kind,
      };
      footprints.push(print);
      if (footprints.length > 260) footprints.shift();
      if (art && art.SpawnFootprint) {
        art.SpawnFootprint(print.position, print.forward, kind, footprints.length % 2 === 0 ? 'L' : 'R');
      }
    },
    QueryFootprints(position, radius, ownerId) {
      const list = [];
      const radiusSq = radius * radius;
      for (let i = 0; i < footprints.length; i += 1) {
        const print = footprints[i];
        if (ownerId && print.ownerId !== ownerId) continue;
        if (MathUtil.DistanceSq2(print.position.x, print.position.z, position.x, position.z) > radiusSq) continue;
        list.push(print);
      }
      return list;
    },

    Update(dt, context) {
      /* 脚印老化 */
      const life = Config.Stealth.footprintLifeSeconds;
      for (let i = footprints.length - 1; i >= 0; i -= 1) {
        footprints[i].age += dt;
        if (footprints[i].age > life) footprints.splice(i, 1);
      }
      /* 门板 / 拦路杆：转到位就停，不每帧写 matrix */
      for (let i = 0; i < movers.length; i += 1) {
        const mover = movers[i];
        if (Math.abs(mover.current - mover.target) < 0.002) continue;
        mover.current = MathUtil.Damp(mover.current, mover.target, 6.5, dt);
        mover.pivot.rotation.y = mover.current;
      }
      const camera = context && context.camera ? context.camera : null;
      /* 还在冒烟的废墟：一缕烟，比十句台词管用 */
      if (art && art.SpawnSmoke && smolderSpots.length > 0) {
        smokeTimer -= dt;
        if (smokeTimer <= 0) {
          smokeTimer = 0.42;
          let bestIndex = -1;
          let bestAge = -1;
          for (let i = 0; i < smolderSpots.length; i += 1) {
            const spot = smolderSpots[i];
            if (camera && MathUtil.DistanceSq2(camera.position.x, camera.position.z, spot.x, spot.z) > 3600) continue;
            spot.timer += dt;
            if (spot.timer > bestAge) { bestAge = spot.timer; bestIndex = i; }
          }
          if (bestIndex >= 0) {
            const spot = smolderSpots[bestIndex];
            spot.timer = 0;
            smokePosition.set(spot.x + (random.Next() - 0.5) * 0.8, spot.y, spot.z + (random.Next() - 0.5) * 0.8);
            art.SpawnSmoke(smokePosition, { seconds: 4.5 * spot.strength, scale: 1.5 * spot.strength });
          }
        }
      }
      /* 小件按距离剔除：碗、鞋、纸这些 50m 外没有意义 */
      if (camera && (((context && context.frame) || 0) % 12) === 0) {
        for (let i = 0; i < staticMeshes.length; i += 1) {
          const mesh = staticMeshes[i];
          const limit = mesh.userData.cullDistance;
          if (limit === undefined) continue;
          const centre = mesh.userData.centre;
          const distance = MathUtil.Distance2(camera.position.x, camera.position.z, centre.x, centre.z);
          mesh.visible = distance - mesh.userData.radius < limit;
        }
      }
    },

    Dispose() {
      for (let i = 0; i < lightHandles.length; i += 1) {
        if (lightHandles[i] && lightHandles[i].Dispose) lightHandles[i].Dispose();
      }
      lightHandles.length = 0;
      for (let i = 0; i < ownedGeometry.length; i += 1) ownedGeometry[i].dispose();
      ownedGeometry.length = 0;
      const keys = Object.keys(geometryLibrary);
      for (let i = 0; i < keys.length; i += 1) {
        const geometry = geometryLibrary[keys[i]];
        if (geometry && geometry.dispose) geometry.dispose();
      }
      for (let i = 0; i < instancedMeshes.length; i += 1) {
        if (instancedMeshes[i].dispose) instancedMeshes[i].dispose();
      }
      if (group.parent) group.parent.remove(group);
      group.clear();
      solids.length = 0;
      covers.length = 0;
      interactables.length = 0;
      interactableIndex.clear();
      footprints.length = 0;
      concealers.length = 0;
      movers.length = 0;
      smolderSpots.length = 0;
    },
  };

  /* 只读的调试视图：Boot 的 debug 面板会读，但不得被 JSON.stringify（含 Vector3 与循环引用） */
  world.debugColliders = solids;
  world.debugStats = {
    solids: solids.length, covers: covers.length, interactables: interactables.length,
    staticMeshes: staticMeshes.length, instancedMeshes: instancedMeshes.length,
    navCells: navCols * navRows, trees: treeInstances.length + pineInstances.length,
    rocks: rockInstances.length,
  };

  return world;
}

export default CreateWorld;
