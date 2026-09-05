// 独立的渲染调试浮窗。它不接管相机、不暂停或修改玩法，也不属于互斥编辑器：
// 美术/程序在场景、地形、摄影棚工具里工作时，仍能把 GBuffer / AO / GI 铺到
// 主画布上看。这是它不能塞进 EDITORS 数组的原因。
//
// 除了「看哪张靶」，面板还管两样全局的调试画法（都在 Exit 里必须还回去）：
//   · 着色模式 —— Unity Scene 视图那三档：着色 / 线框 / 着色线框（PostPipeline.SetShadingMode）；
//   · 物理碰撞体线框 —— 从 Rapier 世界里把每一只碰撞体按形状画成线，挂成 Post 的调试叠加层
//     （ColliderWireframe，本文件下半部分）。它读的是物理世界**实际的**碰撞体，不是建关时的
//     colliders 表 —— 破坏摘掉的、编辑器新加的、地形炸出来的 trimesh 都以物理世界为准。

import * as THREE from "three";
import { Panel, Section, Chips, Facts, Note, Toggle, El } from "./Script_EditorUi.mjs";
import { InjectDepthPull, SHADING_MODES } from "./Script_Post.mjs";
import { R } from "./Script_Physics.mjs";

const VIEWS = [
  { id: "final", label: "最终画面", group: "输出", note: "正式的合成 + FXAA 输出。" },
  { id: "hdr", label: "HDR 场景", group: "输出", note: "泛光、雾和调色之前的主场景 HDR 靶。" },
  { id: "bloomExtract", label: "Bloom 提取", group: "后处理", note: "按阈值、软膝与亮度钳制后的半分辨率亮部；黑色区域不会进入 Bloom。" },
  { id: "bloom", label: "Bloom 合成", group: "后处理", note: "多级降采样再 tent 升采样叠回的最终 Bloom 靶；与正式合成实际采样的是同一张。" },
  { id: "fog", label: "雾量", group: "后处理", note: "指数距离雾 × 高度衰减得到的实际混合系数；深蓝 = 无雾、暖黄 = 雾量高。" },
  { id: "dof", label: "景深 CoC", group: "后处理", note: "正式景深使用的散焦系数；蓝 = 锐利、暖黄 = 最大散焦。景深只在阵亡镜头启用。" },
  { id: "normal", label: "法线", group: "GBuffer", note: "NormalDepth 预通道的视空间法线。" },
  { id: "depth", label: "视深", group: "GBuffer", note: "NormalDepth 预通道 alpha；近处亮、80 m 以外渐黑。第一人称的手与枪写的是常数 1 m 近景标签（它的几何带非等比深度压缩，视深不是世界视深），所以那一块是一片平的。" },
  { id: "motionVector", label: "Motion Vector", group: "GBuffer", note: "由深度反投影得到的相机屏幕速度：R/G = 水平/垂直方向，B = 像素速度。没有逐物体速度缓冲。" },
  { id: "ao", label: "AO 原始", group: "AO", note: "SSAO 尚未双边模糊的半分辨率结果。" },
  { id: "aoBlur", label: "AO 模糊", group: "AO", note: "实际注入材质间接光的 AO 结果。" },
  { id: "baseColor", label: "BaseColor", group: "材质", note: "反照率（贴图×顶点色×材质色），光照之前的底色。" },
  { id: "roughness", label: "粗糙度", group: "材质", note: "ORM 采样后的 roughnessFactor；白 = 糙、黑 = 光。" },
  { id: "metalness", label: "金属度", group: "材质", note: "ORM 采样后的 metalnessFactor；这一关的世界大多是 0（黑），枪机、刺刀才亮。" },
  { id: "shadow", label: "太阳阴影", group: "光照", note: "平行光阴影因子：白 = 照到、黑 = 挡住。阴影框只有 66 m，框外恒白 —— 顺带能看到覆盖边界。不收影的材质显示黑。" },
  { id: "diffuseLighting", label: "Diffuse Lighting", group: "光照", note: "正式 reflectedLight.directDiffuse：太阳/局部直射的漫反射贡献（HDR 映射显示）。" },
  { id: "specularLighting", label: "Specular Lighting", group: "光照", note: "正式 reflectedLight.directSpecular：太阳/局部直射的镜面高光贡献（HDR 映射显示）。" },
  { id: "reflection", label: "Reflection", group: "光照", note: "正式 reflectedLight.indirectSpecular：环境 IBL 的粗糙反射，已包含正式 SSAO/GI 镜面遮蔽。" },
  { id: "indirectLighting", label: "Indirect Lighting", group: "光照", note: "正式 reflectedLight.indirectDiffuse：探针 GI 或天空 IBL 的漫反射，已包含正式 SSAO。" },
  { id: "giWorld", label: "GI 辐照度", group: "光照", note: "材质最终采用的间接辐照度（×0.05）；探针体外按正式渲染回退到天空 IBL，不应为黑。" },
  { id: "giConfidence", label: "GI 置信度", group: "光照", note: "取样置信度：1 = 全用探针，0 = 退回天空 IBL；体积边缘的淡出带就在这里看。探针体关着（出厂默认）时恒 0，全黑是准确信息。" },
  { id: "giIrradiance", label: "辐照度图集", group: "GI", note: "实时探针体的 RGB 辐照度 atlas；探针体没开时显示不可用斜纹（去「画质」里打开）。" },
  { id: "giDistance", label: "距离图集", group: "GI", note: "实时探针体的 R/G 距离矩；探针体没开时显示不可用斜纹。" },
];

/** 着色模式 chips。id 与 Script_Post.SHADING_MODES 一致。 */
const SHADINGS = [
  { id: "shaded", label: "着色", note: "正式画面。" },
  { id: "wireframe", label: "线框", note: "只画三角形边：深灰底 + 亮线，绕过曝光/雾/泛光/调色直接送屏，TAA 抖动同时停掉。不做隐藏线消除。" },
  { id: "shadedWireframe", label: "着色线框", note: "正式画面上叠一层压暗的三角形边线；进 TAA 与合成，是「带线的正片」。" },
];

/**
 * 材质注入侧的假彩色编号（Script_Gi.MakeGiUniforms 的 debugView，
 * Script_Materials 按它把对应通道当颜色写出）。前向管线没有 GBuffer，
 * BaseColor / 粗糙度 / 金属度 / 阴影只存在于材质着色器内部，只能这么拿。
 * 表里没有的视图必须把 uniform 归零，否则材质还在输出上一个假彩色。
 */
const MATERIAL_VIEW_MODES = {
  giWorld: 1, giConfidence: 3, baseColor: 6, roughness: 7, metalness: 8, shadow: 9,
  diffuseLighting: 10, specularLighting: 11, reflection: 12, indirectLighting: 13,
};

/**
 * 视图 id -> 它正在显示的那张靶。与 Post._GetDebugSource 是同一张表，
 * 改一边必须改另一边，否则面板报的尺寸不是屏幕上那张图的尺寸。
 */
const VIEW_TARGETS = {
  final: (post) => post?.targets?.ldr,
  hdr: (post) => post?.targets?.hdr,
  bloomExtract: (post) => post?.targets?.bright,
  bloom: (post) => post?.BloomTarget,
  fog: (post) => post?.targets?.normalDepth,
  dof: (post) => post?.targets?.normalDepth,
  normal: (post) => post?.targets?.normalDepth,
  depth: (post) => post?.targets?.normalDepth,
  motionVector: (post) => post?.targets?.normalDepth,
  ao: (post) => post?.targets?.ao,
  aoBlur: (post) => post?.targets?.aoBlur,
  giIrradiance: (post, gi) => gi?.irradiance?.[gi.pingPong],
  giDistance: (post, gi) => gi?.distanceMoments?.[gi.pingPong],
  // 材质通道假彩色都是场景按调试口径重画进 hdr 靶再送屏
  baseColor: (post) => post?.targets?.hdr,
  roughness: (post) => post?.targets?.hdr,
  metalness: (post) => post?.targets?.hdr,
  shadow: (post) => post?.targets?.hdr,
  diffuseLighting: (post) => post?.targets?.hdr,
  specularLighting: (post) => post?.targets?.hdr,
  reflection: (post) => post?.targets?.hdr,
  indirectLighting: (post) => post?.targets?.hdr,
  giWorld: (post) => post?.targets?.hdr,
  giConfidence: (post) => post?.targets?.hdr,
};

// ---------------------------------------------------------------------------
// 物理碰撞体线框
// ---------------------------------------------------------------------------

/**
 * 分类与颜色（sRGB 十六进制是唯一来源：图例用它，画进线性 hdr 靶前转线性）。
 *   solid     静态长方体 —— 墙、房、垛口、路基、道具（Unity 碰撞体那种绿）
 *   terrain   静态三角网 —— 爆炸形变出来的地形块（`SetTerrainTile`）
 *   character 运动学胶囊 —— 玩家与 AI 的角色控制器
 *   dynamic   动态刚体   —— 手雷（球）、尸体（锁旋转胶囊）
 *   sensor    传感器     —— 当前项目没有，留着是为了它一旦出现就一眼认得出
 */
export const COLLIDER_CATEGORIES = [
  { id: "solid", label: "静态实体", hex: "#82f59a" },
  { id: "terrain", label: "地形块", hex: "#f9e878" },
  { id: "character", label: "角色胶囊", hex: "#70d9ff" },
  { id: "dynamic", label: "动态刚体", hex: "#ffad61" },
  { id: "sensor", label: "传感器", hex: "#ff7bed" },
];
const CATEGORY_LINEAR = Object.fromEntries(COLLIDER_CATEGORIES.map((c) => {
  const color = new THREE.Color(c.hex).convertSRGBToLinear();
  return [c.id, [color.r, color.g, color.b]];
}));

const RING_SEGMENTS = 16;
const ARC_SEGMENTS = 8;
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _corners = new Float32Array(24);

/**
 * 把 Rapier 世界里的碰撞体画成线段，挂成 PostPipeline 的调试叠加层。
 *
 * 两层几何：
 *   · 静态层 —— 固定刚体下的碰撞体（几千只盒子 + 地形 trimesh）。只在**成员变了**时重建：
 *     每帧扫一遍 world.colliders，见到不在缓存里的固定碰撞体、或缓存里少了谁，就整层重来。
 *     整层重建几千只盒子是十几毫秒一次的事，逐帧重建才是每帧十几毫秒。
 *   · 动态层 —— 运动学（角色）与动态（手雷、尸体）刚体，每帧重画（几十到几百只）。
 * 不用 Rapier 自带的 `world.debugRender()`：它每帧把全部几何（含几千只静态盒）拷出 wasm，
 * 而且不区分「谁是谁」，只能按刚体类型给色。这里按形状自己画，静态层能缓存，颜色能分类。
 *
 * 线材质带 InjectDepthPull：碰撞盒的棱正好落在墙的棱上，不拉近一点深度测试是一串虚线。
 * `xray` 关深度测试，隔墙也看得见。
 */
export class ColliderWireframe {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "DebugColliderWireframe";
    this.material = InjectDepthPull(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.92,
      depthTest: true, depthWrite: false, toneMapped: false, fog: false,
    }), 0.003);
    this.material.name = "DebugColliderLines";
    this.staticLayer = this._MakeLayer(8192);
    this.dynamicLayer = this._MakeLayer(1024);
    this.root.add(this.staticLayer.lines, this.dynamicLayer.lines);
    this.filters = { solid: true, terrain: true, character: true, dynamic: true, sensor: true };
    this.xray = false;
    this.staticHandles = new Set();
    this.staticDirty = true;
    this.physics = null;
    this.frame = 0;
    this.lastColliderCount = -1;
    this.stats = {
      solid: 0, terrain: 0, character: 0, dynamic: 0, sensor: 0, unsupported: 0,
      staticSegments: 0, dynamicSegments: 0, buildMs: 0, rebuilds: 0,
    };
    // Post 在画之前把本帧曝光递进来：线色写进 hdr 靶后还要乘曝光，夜战 3.6 会把
    // 分类色全冲成白、白天 0.5 会压成灰 —— 先按 1/曝光预补，屏幕上永远是同一个亮度。
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      this.material.color.setScalar(1 / THREE.MathUtils.clamp(exposure || 1, 0.05, 20));
    };
  }

  _MakeLayer(capacityVertices) {
    const geometry = new THREE.BufferGeometry();
    const layer = { geometry, lines: null, positions: null, colors: null, capacity: 0, count: 0 };
    this._Allocate(layer, capacityVertices);
    layer.lines = new THREE.LineSegments(geometry, this.material);
    layer.lines.frustumCulled = false;   // 全城一根 LineSegments，包围球算了也是整个城
    layer.lines.matrixAutoUpdate = false;
    return layer;
  }

  _Allocate(layer, capacityVertices) {
    // 换缓冲前先 dispose：让 WebGLGeometries 放掉旧的 GL buffer，几何对象本身照用。
    if (layer.capacity) layer.geometry.dispose();
    layer.capacity = capacityVertices;
    layer.positions = new Float32Array(capacityVertices * 3);
    layer.colors = new Float32Array(capacityVertices * 3);
    const position = new THREE.BufferAttribute(layer.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.BufferAttribute(layer.colors, 3).setUsage(THREE.DynamicDrawUsage);
    layer.geometry.setAttribute("position", position);
    layer.geometry.setAttribute("color", color);
  }

  _Begin(layer) { layer.count = 0; }

  _End(layer) {
    const position = layer.geometry.getAttribute("position");
    const color = layer.geometry.getAttribute("color");
    position.needsUpdate = true;
    color.needsUpdate = true;
    // 只上传写过的那一段；没写就把 drawRange 归零而不是留上一帧的旧线
    position.clearUpdateRanges();
    color.clearUpdateRanges();
    if (layer.count > 0) {
      position.addUpdateRange(0, layer.count * 3);
      color.addUpdateRange(0, layer.count * 3);
    }
    layer.geometry.setDrawRange(0, layer.count);
  }

  _Segment(layer, ax, ay, az, bx, by, bz, rgb) {
    if (layer.count + 2 > layer.capacity) {
      const positions = layer.positions;
      const colors = layer.colors;
      this._Allocate(layer, Math.max(layer.capacity * 2, layer.count + 2));
      layer.positions.set(positions);
      layer.colors.set(colors);
    }
    const p = layer.positions;
    const c = layer.colors;
    let i = layer.count * 3;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az;
    c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2];
    i += 3;
    p[i] = bx; p[i + 1] = by; p[i + 2] = bz;
    c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2];
    layer.count += 2;
  }

  /** 局部点 -> 世界（_t/_q 已装好当前碰撞体的位姿）。 */
  _World(x, y, z, out) {
    return out.set(x, y, z).applyQuaternion(_q).add(_t);
  }

  _LocalSegment(layer, ax, ay, az, bx, by, bz, rgb) {
    this._World(ax, ay, az, _a);
    this._World(bx, by, bz, _b);
    this._Segment(layer, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z, rgb);
  }

  _EmitCuboid(layer, hx, hy, hz, rgb) {
    for (let i = 0; i < 8; i += 1) {
      this._World((i & 1) ? hx : -hx, (i & 2) ? hy : -hy, (i & 4) ? hz : -hz, _a);
      _corners[i * 3] = _a.x; _corners[i * 3 + 1] = _a.y; _corners[i * 3 + 2] = _a.z;
    }
    for (let i = 0; i < 8; i += 1) {
      for (const bit of [1, 2, 4]) {
        const j = i | bit;
        if (j === i) continue;
        this._Segment(layer, _corners[i * 3], _corners[i * 3 + 1], _corners[i * 3 + 2],
          _corners[j * 3], _corners[j * 3 + 1], _corners[j * 3 + 2], rgb);
      }
    }
  }

  /** 平行于 XZ 的整圆（胶囊端面、球的赤道）。 */
  _EmitRingXZ(layer, y, r, rgb) {
    for (let s = 0; s < RING_SEGMENTS; s += 1) {
      const a0 = (s / RING_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / RING_SEGMENTS) * Math.PI * 2;
      this._LocalSegment(layer, Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r, rgb);
    }
  }

  /** 竖直平面里的一段弧：plane 0 = XY 面，1 = ZY 面；从角 from 扫到 to（弧度，绕圆心 (0, y0, 0)）。 */
  _EmitArcVertical(layer, plane, y0, r, from, to, rgb) {
    for (let s = 0; s < ARC_SEGMENTS; s += 1) {
      const a0 = from + (to - from) * (s / ARC_SEGMENTS);
      const a1 = from + (to - from) * ((s + 1) / ARC_SEGMENTS);
      const x0 = Math.cos(a0) * r, y0a = y0 + Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, y1a = y0 + Math.sin(a1) * r;
      if (plane === 0) this._LocalSegment(layer, x0, y0a, 0, x1, y1a, 0, rgb);
      else this._LocalSegment(layer, 0, y0a, x0, 0, y1a, x1, rgb);
    }
  }

  /** Rapier 胶囊：轴是局部 Y，halfHeight 是圆柱段的半高。 */
  _EmitCapsule(layer, halfHeight, r, rgb) {
    this._EmitRingXZ(layer, halfHeight, r, rgb);
    this._EmitRingXZ(layer, -halfHeight, r, rgb);
    this._LocalSegment(layer, r, -halfHeight, 0, r, halfHeight, 0, rgb);
    this._LocalSegment(layer, -r, -halfHeight, 0, -r, halfHeight, 0, rgb);
    this._LocalSegment(layer, 0, -halfHeight, r, 0, halfHeight, r, rgb);
    this._LocalSegment(layer, 0, -halfHeight, -r, 0, halfHeight, -r, rgb);
    for (const plane of [0, 1]) {
      this._EmitArcVertical(layer, plane, halfHeight, r, 0, Math.PI, rgb);
      this._EmitArcVertical(layer, plane, -halfHeight, r, Math.PI, Math.PI * 2, rgb);
    }
  }

  _EmitBall(layer, r, rgb) {
    this._EmitRingXZ(layer, 0, r, rgb);
    for (const plane of [0, 1]) this._EmitArcVertical(layer, plane, 0, r, 0, Math.PI * 2, rgb);
  }

  /** 三角网：每条边只画一次（Set 去重），顶点先整批转到世界。 */
  _EmitTriMesh(layer, vertices, indices, rgb) {
    const n = (vertices.length / 3) | 0;
    if (!n || !indices) return;
    const world = new Float32Array(vertices.length);
    for (let i = 0; i < n; i += 1) {
      this._World(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2], _a);
      world[i * 3] = _a.x; world[i * 3 + 1] = _a.y; world[i * 3 + 2] = _a.z;
    }
    const seen = new Set();
    const Edge = (i, j) => {
      const lo = Math.min(i, j), hi = Math.max(i, j);
      const key = lo * n + hi;
      if (seen.has(key)) return;
      seen.add(key);
      this._Segment(layer, world[lo * 3], world[lo * 3 + 1], world[lo * 3 + 2],
        world[hi * 3], world[hi * 3 + 1], world[hi * 3 + 2], rgb);
    };
    for (let t = 0; t + 2 < indices.length; t += 3) {
      Edge(indices[t], indices[t + 1]);
      Edge(indices[t + 1], indices[t + 2]);
      Edge(indices[t + 2], indices[t]);
    }
  }

  /**
   * 画一只碰撞体。kind 是刚体类型给出的大类（"static" / "character" / "dynamic"），
   * 静态再按形状分「实体盒」与「地形网」，传感器一律品红。
   * @returns {string|null} 归到的分类（用来计数），画不了的形状返回 null。
   */
  _EmitCollider(layer, collider, kind) {
    const shape = collider.shape;
    if (!shape) return null;
    const ST = R.ShapeType;
    let category = kind;
    if (kind === "static") category = (shape.type === ST.TriMesh || shape.type === ST.HeightField) ? "terrain" : "solid";
    if (collider.isSensor()) category = "sensor";
    if (!this.filters[category]) return category;
    const rgb = CATEGORY_LINEAR[category];
    const t = collider.translation();
    const q = collider.rotation();
    _t.set(t.x, t.y, t.z);
    _q.set(q.x, q.y, q.z, q.w);
    switch (shape.type) {
      case ST.Cuboid:
      case ST.RoundCuboid:
        this._EmitCuboid(layer, shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z, rgb);
        return category;
      case ST.Capsule:
        this._EmitCapsule(layer, shape.halfHeight, shape.radius, rgb);
        return category;
      case ST.Ball:
        this._EmitBall(layer, shape.radius, rgb);
        return category;
      case ST.TriMesh:
        this._EmitTriMesh(layer, shape.vertices, shape.indices, rgb);
        return category;
      default:
        return null;
    }
  }

  _RebuildStatic(physics) {
    const t0 = performance.now();
    const layer = this.staticLayer;
    const stats = this.stats;
    stats.solid = 0; stats.terrain = 0; stats.sensor = 0; stats.unsupported = 0;
    this.staticHandles.clear();
    this._Begin(layer);
    const Fixed = R.RigidBodyType.Fixed;
    physics.world.colliders.forEach((collider) => {
      const body = collider.parent();
      if (body && body.bodyType() !== Fixed) return;
      this.staticHandles.add(collider.handle);
      const category = this._EmitCollider(layer, collider, "static");
      if (category) stats[category] += 1; else stats.unsupported += 1;
    });
    this._End(layer);
    stats.staticSegments = layer.count / 2;
    stats.buildMs = performance.now() - t0;
    stats.rebuilds += 1;
  }

  /**
   * 相机是不是站在这只胶囊里。第一人称时玩家自己的胶囊把相机整个包着，
   * 它前面那根竖棱正好投影成一条贯穿屏幕正中的竖线，像个坏掉的准星 ——
   * 站在里面的那只不画；自由飞行镜头离开身体后它照常出现。
   */
  _CameraInsideCapsule(collider, shape, cameraPosition) {
    if (!cameraPosition) return false;
    const t = collider.translation();
    const q = collider.rotation();
    _t.set(t.x, t.y, t.z);
    _q.set(q.x, q.y, q.z, q.w);
    const axis = _a.set(0, 1, 0).applyQuaternion(_q);
    const d = _b.copy(cameraPosition).sub(_t);
    const h = THREE.MathUtils.clamp(d.dot(axis), -shape.halfHeight, shape.halfHeight);
    d.addScaledVector(axis, -h);
    return d.lengthSq() < (shape.radius + 0.02) ** 2;
  }

  _EmitMoving(layer, collider, kind, cameraPosition) {
    const shape = collider.shape;
    if (kind === "character" && shape?.type === R.ShapeType.Capsule
      && this._CameraInsideCapsule(collider, shape, cameraPosition)) return kind;
    return this._EmitCollider(layer, collider, kind);
  }

  /**
   * 每帧：动态层重画；静态层只在成员变化时重建。
   *
   * 动态层平时直接走 physics.characters / physics.dynamics（几十只），不扫全部一万多只碰撞体；
   * 碰撞体总数一变、或每 60 帧一次，才全扫一遍对静态层的账（新加 / 摘掉的固定碰撞体）。
   * @param {THREE.Vector3|null} cameraPosition 世界坐标；用来跳过相机所在的那只角色胶囊
   */
  Update(physics, cameraPosition = null) {
    if (!R || !physics || physics.disposed || !physics.world) {
      this.Clear();
      return;
    }
    if (this.physics !== physics) {
      this.physics = physics;
      this.staticDirty = true;
    }
    this.frame += 1;
    const stats = this.stats;
    const layer = this.dynamicLayer;
    const Fixed = R.RigidBodyType.Fixed;
    const Dynamic = R.RigidBodyType.Dynamic;
    const total = physics.world.colliders.len();
    const fullScan = this.staticDirty || total !== this.lastColliderCount || this.frame % 60 === 0;
    stats.character = 0; stats.dynamic = 0;
    this._Begin(layer);
    if (fullScan) {
      let cachedSeen = 0;
      let newStatic = 0;
      physics.world.colliders.forEach((collider) => {
        if (this.staticHandles.has(collider.handle)) { cachedSeen += 1; return; }
        const body = collider.parent();
        const type = body ? body.bodyType() : Fixed;
        if (type === Fixed) { newStatic += 1; return; }
        const kind = type === Dynamic ? "dynamic" : "character";
        if (this._EmitMoving(layer, collider, kind, cameraPosition) === kind) stats[kind] += 1;
      });
      // 缓存里多了没见过的固定碰撞体（新加）、或少了谁（被摘），静态层整层重来。
      // 句柄带世代号：同一格位摘掉再放新的，句柄不同，一样会被当成"新加"。
      if (newStatic > 0 || cachedSeen !== this.staticHandles.size) this.staticDirty = true;
    } else {
      for (const character of physics.characters) {
        if (character.detached || !character.collider) continue;
        if (this._EmitMoving(layer, character.collider, "character", cameraPosition) === "character") stats.character += 1;
      }
      for (const body of physics.dynamics) {
        const n = body.numColliders();
        for (let i = 0; i < n; i += 1) {
          if (this._EmitMoving(layer, body.collider(i), "dynamic", cameraPosition) === "dynamic") stats.dynamic += 1;
        }
      }
    }
    this._End(layer);
    stats.dynamicSegments = layer.count / 2;
    this.lastColliderCount = total;
    if (this.staticDirty) {
      this._RebuildStatic(physics);
      this.staticDirty = false;
    }
  }

  /** 物理世界没了（换关重建中）就什么都不画，别留上一关的盒子飘在新城上。 */
  Clear() {
    this.physics = null;
    this.staticHandles.clear();
    this.staticDirty = true;
    this.lastColliderCount = -1;
    for (const layer of [this.staticLayer, this.dynamicLayer]) {
      this._Begin(layer);
      this._End(layer);
    }
  }

  SetFilter(category, on) {
    if (!(category in this.filters)) return;
    this.filters[category] = !!on;
    this.staticDirty = true;   // 动态层每帧重画，静态层要显式重建
  }

  SetXray(on) {
    this.xray = !!on;
    this.material.depthTest = !this.xray;
    this.material.needsUpdate = true;
  }

  Dispose() {
    this.staticLayer.geometry.dispose();
    this.dynamicLayer.geometry.dispose();
    this.material.dispose();
    this.root.clear();
  }
}

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

export class DebugRenderingEditor {
  static id = "debugRendering";
  static label = "Debug Rendering";
  static hint = "叠加查看 GBuffer、AO、GI 与后处理靶，切换着色/线框，显示物理碰撞体；切换其它编辑器、关掉面板回去打仗都保持打开";
  /**
   * 关设置面板（回去打仗）**不收它**，与 Profiler 同一条规矩：运行时渲染 bug
   * （第一人称手上的黑块、雾/AO 在移动中的闪烁）只在玩法照跑时才复现，
   * 关面板就归还最终画面的话，调试视图只能看静止的一帧。停它：面板里再点一次
   * 「Debug Rendering」，或点浮窗右上角的 ×，或「全部关掉」。
   * 着色模式与碰撞体线框同样留着：边打边看线框 / 碰撞盒正是它们的用法。
   */
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.view = "final";
    this.shading = "shaded";
    this.facts = null;
    // 四组 chips 是四个各自独立的高亮控件，但它们表示的是**同一个**选择。
    // 不集中同步的话，点了「辐照度图集」之后「最终画面」那一格还亮着 ——
    // 面板上会同时亮四格，读者根本判断不出当前送屏的是哪一张靶。
    this.chipGroups = [];
    this.shadingChips = null;
    /** 碰撞体线框层；关着时是 null（不占几何、不占每帧扫描）。 */
    this.colliders = null;
    this.colliderXray = false;
    this.colliderFilters = { solid: true, terrain: true, character: true, dynamic: true, sensor: true };
    this.colliderToggle = null;
    this._cameraWorld = new THREE.Vector3();
  }

  /** 相机世界坐标（相机挂在场景图里，别直接读 position）。 */
  CameraWorldPosition() {
    const camera = this.host.camera;
    if (!camera) return null;
    return camera.getWorldPosition(this._cameraWorld);
  }

  Enter(root) {
    this.panel = Panel({
      title: "Debug Rendering", sub: "叠加预览",
      variant: "work debugRendering", onClose: () => this.host.CloseDebugRendering(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.SetView(this.host.post?.GetDebugView?.() || "final");
    this.SetShading(this.host.post?.GetShadingMode?.() || "shaded");
    return this;
  }

  Exit() {
    // 退出这个浮窗，必须立即归还正常屏幕输出；不能把上一次的法线图带回游戏，
    // 材质 uniform 也要一并归零 —— 留着的话所有材质还在往 hdr 靶里写假彩色。
    // 着色模式与碰撞体叠加层同理：面板没了，线框也不许留在正片上。
    this.host.post?.SetDebugView?.("final");
    this.host.post?.SetShadingMode?.("shaded");
    const pack = this.host.library?.gi;
    if (pack) pack.debugView.value = 0;
    this.SetColliders(false);
    this.panel?.root.remove();
    this.panel = null;
    this.facts = null;
    this.chipGroups = [];
    this.shadingChips = null;
    this.colliderToggle = null;
  }

  BuildUi(body) {
    this.chipGroups = [];
    // 着色模式与物理在最上面：它们改的是整幅画怎么画，不是「看哪张靶」。
    const shading = Section(body, "着色模式");
    this.shadingChips = Chips(shading,
      SHADINGS.map((item) => ({ value: item.id, label: item.label, title: item.note })),
      this.shading, (id) => this.SetShading(id));
    // 冒烟按 .edViewChips 数「亮着的视图格」；着色模式的格子另起一类，别混进去
    this.shadingChips.root.classList.add("edShadingChips");
    Note(shading, "线框 = 只画三角形边，绕过后处理直接送屏；着色线框 = 正片上叠压暗的边线。"
      + "烟、火、粒子、天空穹与贴片不进线框（它们的材质换不掉）。第一人称照常出线。");

    const physics = Section(body, "物理");
    const switches = El("div", "edBtns");
    this.colliderToggle = Toggle(switches, "碰撞体线框", false, (on) => this.SetColliders(on));
    this.colliderToggle.root.dataset.role = "colliders";
    const xray = Toggle(switches, "透视", this.colliderXray, (on) => this.SetColliderXray(on));
    xray.root.title = "关掉深度测试，隔着墙也画；默认贴面深度测试，被几何挡住的碰撞体看不见";
    physics.appendChild(switches);
    const filterBox = El("div", "edBtns");
    for (const category of COLLIDER_CATEGORIES) {
      const toggle = Toggle(filterBox, category.label, this.colliderFilters[category.id],
        (on) => this.SetColliderFilter(category.id, on));
      toggle.root.title = `只显示 / 隐藏「${category.label}」这一类`;
    }
    physics.appendChild(filterBox);
    const legend = El("div", "edLegend");
    for (const category of COLLIDER_CATEGORIES) {
      const item = El("span");
      const swatch = El("i", "edSwatch");
      swatch.style.background = category.hex;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(category.label));
      legend.appendChild(item);
    }
    physics.appendChild(legend);
    Note(physics, "画的是 Rapier 世界里实际存在的碰撞体（破坏摘掉的不画、编辑器新加的会出现），"
      + "静态层只在成员变化时重建。棱贴着墙的棱，靠深度拉近一点赢过面；相机所在的那只角色胶囊不画。");

    for (const group of ["输出", "后处理", "GBuffer", "材质", "光照", "AO", "GI"]) {
      const section = Section(body, group);
      const options = VIEWS.filter((item) => item.group === group)
        .map((item) => ({ value: item.id, label: item.label, title: item.note }));
      const chips = Chips(section, options, this.view, (id) => this.SetView(id));
      chips.root.classList.add("edViewChips");
      this.chipGroups.push(chips);
    }
    Note(body,
      "前景叠加，开着别的编辑器也不关。前向管线没有 GBuffer：「材质」「光照」是"
      + "假彩色重画一帧（low 档不可用）。第一人称的手与枪进全部视图；只有 GBuffer 的"
      + "「视深」是个例外 —— 视图模型带非等比深度压缩，那里写的是常数近景标签 1 m，"
      + "不是它自己的视深。", true);
    const stat = Section(body, "当前靶");
    this.facts = Facts(stat);
  }

  SetView(id) {
    if (!VIEWS.some((item) => item.id === id)) id = "final";
    this.view = id;
    // 每一组都刷一遍：选中的那一组把自己点亮，其余各组一起熄掉。
    for (const chips of this.chipGroups) chips.Set(id);
    // 材质假彩色与送屏视图必须同帧同步：uniform 指挥材质写什么，
    // post 决定拿哪张靶、按哪种口径显示。只设一边就是「面板亮着、画面没变」。
    const pack = this.host.library?.gi;
    if (pack) pack.debugView.value = MATERIAL_VIEW_MODES[id] || 0;
    // 第三参 = 材质注了调试层没有：GI 出厂默认关时探针体（host.gi）是 null，
    // 但材质/光照组的假彩色照样可用 —— 可用性要看 library.gi，不看探针体。
    this.host.post?.SetDebugView?.(id, this.host.gi, !!pack);
  }

  /** 着色模式：着色 / 线框 / 着色线框（Script_Post.SetShadingMode）。 */
  SetShading(id) {
    if (!SHADING_MODES.includes(id)) id = "shaded";
    this.shading = this.host.post?.SetShadingMode?.(id) ?? id;
    this.shadingChips?.Set(this.shading);
    return this.shading;
  }

  /** 碰撞体线框开关：建/拆 ColliderWireframe 并挂/摘 Post 的调试叠加层。 */
  SetColliders(on) {
    const want = !!on;
    if (want === !!this.colliders) {
      this.colliderToggle?.Set(want);
      return this.colliders;
    }
    if (want) {
      this.colliders = new ColliderWireframe();
      for (const [category, enabled] of Object.entries(this.colliderFilters)) this.colliders.SetFilter(category, enabled);
      this.colliders.SetXray(this.colliderXray);
      this.colliders.Update(this.host.physics, this.CameraWorldPosition());
      this.host.post?.AddDebugOverlay?.(this.colliders.root);
    } else {
      this.host.post?.RemoveDebugOverlay?.(this.colliders.root);
      this.colliders.Dispose();
      this.colliders = null;
    }
    this.colliderToggle?.Set(want);
    return this.colliders;
  }

  SetColliderXray(on) {
    this.colliderXray = !!on;
    this.colliders?.SetXray(this.colliderXray);
  }

  SetColliderFilter(category, on) {
    if (!(category in this.colliderFilters)) return;
    this.colliderFilters[category] = !!on;
    this.colliders?.SetFilter(category, on);
  }

  /**
   * 数一遍第一人称树（`viewmodel.root`：手、袖、枪、刺刀、手雷、枪口焰）。
   *
   * 半透明件（枪口焰）按 MarkForegroundPrepass 的约定**不**进预通道，也不算注入
   * 分母 —— 它没有可用的法线，混进 GBuffer 只会污染 SSAO，不是漏接。
   */
  FirstPersonStatus() {
    const root = this.host.viewmodel?.root;
    if (!root) return null;
    const status = { meshes: 0, prepass: 0, materials: 0, injected: 0, visible: !!root.visible };
    const seen = new Set();
    root.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      if (list.some((material) => material?.transparent)) return;
      status.meshes += 1;
      if (object.userData.foregroundPrepass) status.prepass += 1;
      for (const material of list) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        status.materials += 1;
        if (material.userData?.indirectLightingInjected) status.injected += 1;
      }
    });
    return status;
  }

  Update() {
    // 碰撞体层每帧对一次物理世界的账（换关期间 physics 可能是 null，层会清空）
    if (this.colliders) this.colliders.Update(this.host.physics, this.CameraWorldPosition());
    if (!this.facts) return;
    const post = this.host.post;
    const gi = this.host.gi;
    const item = VIEWS.find((entry) => entry.id === this.view) || VIEWS[0];
    // 以前这一行按视图 id 直接去 post.targets 里查同名键，于是 final 与 bloom
    // 恒为"—"（两者都没有同名靶），看着像靶根本没建出来。
    const target = VIEW_TARGETS[this.view]?.(post, gi) ?? null;
    this.facts.Set("显示", item.label);
    this.facts.Set("说明", item.note);
    this.facts.Set("尺寸", target ? `${target.width} × ${target.height}` : "—", target ? "" : "warn");
    const shading = SHADINGS.find((entry) => entry.id === this.shading) || SHADINGS[0];
    this.facts.Set("着色模式", shading.label + (this.shading === "wireframe" && this.view === "final" ? "（hdr 靶直通，跳过合成）" : ""),
      this.shading === "shaded" ? "" : "warn");
    if (this.colliders) {
      const s = this.colliders.stats;
      const physics = this.host.physics;
      this.facts.Set("碰撞体",
        physics && !physics.disposed
          ? `静态 ${s.solid} · 地形 ${s.terrain} · 角色 ${s.character} · 动态 ${s.dynamic}${s.sensor ? ` · 传感器 ${s.sensor}` : ""}${s.unsupported ? ` · 画不了 ${s.unsupported}` : ""}`
          : "物理世界未就绪（换关中）",
        physics && !physics.disposed ? (s.unsupported ? "warn" : "good") : "warn");
      this.facts.Set("碰撞线段", `${s.staticSegments + s.dynamicSegments}（静态层重建 ${s.rebuilds} 次 · 上次 ${s.buildMs.toFixed(1)} ms）`);
    } else {
      this.facts.Set("碰撞体", "未显示");
      this.facts.Set("碰撞线段", "—");
    }
    this.facts.Set("SSAO", post?.preset?.ssao ? "启用" : "当前画质档关闭", post?.preset?.ssao ? "good" : "warn");
    this.facts.Set("GI 探针体", gi ? (gi.enabled ? `启用 · ${gi.warmed}/${gi.probeCount}` : "已构造，当前关闭") : "未构造（出厂默认关，画质 → 全局光照里打开）", gi?.enabled ? "good" : "warn");
    // 材质/光照组的两个前置条件：材质注入过（low 档没有）、阴影真的开着
    const injected = !!this.host.library?.gi;
    this.facts.Set("材质假彩色", injected ? "已注入" : "low 档未注入，材质/光照组不可用", injected ? "good" : "warn");
    const shadowOn = !!this.host.renderer?.shadowMap?.enabled;
    this.facts.Set("太阳阴影", shadowOn ? "启用" : "关闭（阴影视图会是全黑/全白）", shadowOn ? "good" : "warn");
    // 第一人称是两条独立的链，坏哪条都只坏一半视图，所以分两项报：
    //   · 前景预通道 —— GBuffer / AO / 雾 / CoC 组看不看得见手和枪；
    //   · 材质注入   —— 材质 / 光照 / GI 组画不画得到它们（外来 GLB 最容易漏）。
    const fp = this.FirstPersonStatus();
    if (!fp) {
      this.facts.Set("第一人称", "本页面没有视图模型", "warn");
    } else {
      const inPrepass = fp.meshes > 0 && fp.prepass === fp.meshes;
      this.facts.Set("第一人称预通道",
        fp.meshes ? `${fp.prepass}/${fp.meshes} 件（半透明件按约定不进）` : "无网格",
        inPrepass || fp.prepass > 0 ? "good" : "warn");
      this.facts.Set("第一人称材质",
        fp.materials ? `${fp.injected}/${fp.materials} 份已注入` : "无材质",
        fp.materials > 0 && fp.injected === fp.materials ? "good" : "warn");
    }
    const composite = post?.uniformsComposite;
    if (this.view === "fog") {
      const density = composite?.uFogDensity?.value ?? 0;
      this.facts.Set("雾效", density > 0 ? `启用 · 密度 ${density.toFixed(3)}` : "关闭（雾量图为深蓝）", density > 0 ? "good" : "warn");
    }
    if (this.view === "dof") {
      const farStrength = composite?.uDofStrength?.value ?? 0;
      const nearStrength = composite?.uNearDofStrength?.value ?? 0;
      const strength = Math.max(farStrength, nearStrength);
      const mode = farStrength > nearStrength ? "阵亡远景" : "开镜近景";
      this.facts.Set("景深", strength > 0 ? `启用 · ${mode} ${strength.toFixed(2)}` : "当前未触发", strength > 0 ? "good" : "warn");
    }
  }
}

export default DebugRenderingEditor;
