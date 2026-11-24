// 特效测试场（VfxPreviewArena）：为独立特效预览窗口构建专业级校准测试环境。
//
// 仅依赖 three 与同目录 Script_VfxPreviewSurfaces（零游戏场景 / 材质库 / 灯光依赖）：
//   · 无限平滑地平线融合 PBR 测试地坪（1 m 混凝土/压实土微观质感 + 径向平滑过渡到天穹地平线）；
//   · 抗锯齿世界坐标技术网格（fwidth 屏幕空间导数，0.25m / 1m / 5m / 20m 自适应刻度 + 1/2/5/10/20m 同心测距环 + X/Z 轴）；
//   · 建筑级光照与反差测试湾（暗色哑光反差背板 + 中灰阴影承接墙 + 90° 侧翼 + 掩体方块，实时承接火光/爆炸光照与阴影）；
//   · 1.75 m 人形比例剪影 + 3 m 标尺立柱（0.5 m 刻度 + 1.7 m 金色人眼标线）；
//   · 按效果自适应的测试装置：弹着点测试靶墙（砖/木/钢板）、水面测试池、大型航弹/炮弹远距标桩。

import * as THREE from "three";
import { PreviewSink } from "./Script_VfxPreviewSurfaces.mjs";

const GRID_VERT = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GRID_FRAG = /* glsl */`
uniform float uCamDist;
uniform float uGridGain;
uniform float uDarkMode;
varying vec3 vWorldPos;

float GridLine(vec2 coord, float spacing, float widthPx) {
  vec2 scaled = coord / spacing;
  vec2 deriv = max(fwidth(scaled), vec2(1e-5));
  vec2 grid = abs(fract(scaled - 0.5) - 0.5) / deriv;
  float line = min(grid.x, grid.y);
  return 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, line);
}

float RingLine(float r, float radius, float widthPx) {
  float d = abs(r - radius);
  float deriv = max(fwidth(r), 1e-5);
  return 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, d / deriv);
}

void main() {
  vec2 xz = vWorldPos.xz;
  float r = length(xz);
  float fadeOuter = max(24.0, uCamDist * 3.1);
  float radialFade = 1.0 - smoothstep(fadeOuter * 0.28, fadeOuter, r);
  if (radialFade <= 0.002) discard;

  float subVis = 1.0 - smoothstep(3.0, 8.0, uCamDist);
  float meterVis = 1.0 - smoothstep(22.0, 56.0, uCamDist);
  float majorVis = 1.0 - smoothstep(85.0, 190.0, uCamDist);
  float wideVis = smoothstep(18.0, 42.0, uCamDist);

  float gSub = GridLine(xz, 0.25, 0.75) * subVis * 0.13;
  float g1 = GridLine(xz, 1.0, 0.9) * meterVis * 0.21;
  float g5 = GridLine(xz, 5.0, 1.2) * majorVis * 0.38;
  float g20 = GridLine(xz, 20.0, 1.35) * wideVis * 0.44;

  // 同心距离标定环：1m / 2m / 5m / 10m / 20m，直接目测爆炸与烟雾半径
  float rings = 0.0;
  rings = max(rings, RingLine(r, 1.0, 1.0) * (1.0 - smoothstep(10.0, 22.0, uCamDist)) * 0.30);
  rings = max(rings, RingLine(r, 2.0, 1.0) * (1.0 - smoothstep(16.0, 34.0, uCamDist)) * 0.30);
  rings = max(rings, RingLine(r, 5.0, 1.15) * (1.0 - smoothstep(45.0, 90.0, uCamDist)) * 0.36);
  rings = max(rings, RingLine(r, 10.0, 1.2) * 0.36);
  rings = max(rings, RingLine(r, 20.0, 1.25) * smoothstep(12.0, 26.0, uCamDist) * 0.40);

  // 原点 X / Z 基准轴线
  vec2 axisDeriv = max(fwidth(xz), vec2(1e-5));
  float axisFade = 1.0 - smoothstep(10.0, max(22.0, uCamDist * 2.0), r);
  float xAxis = (1.0 - smoothstep(0.6, 1.5, abs(xz.y) / axisDeriv.y)) * axisFade;
  float zAxis = (1.0 - smoothstep(0.6, 1.5, abs(xz.x) / axisDeriv.x)) * axisFade;

  vec3 minorCol = mix(vec3(0.40, 0.39, 0.35), vec3(0.14, 0.15, 0.16), uDarkMode);
  vec3 majorCol = mix(vec3(0.64, 0.59, 0.46), vec3(0.28, 0.27, 0.23), uDarkMode);
  vec3 ringCol = mix(vec3(0.84, 0.72, 0.46), vec3(0.56, 0.48, 0.30), uDarkMode);
  vec3 xCol = mix(vec3(0.76, 0.30, 0.25), vec3(0.52, 0.22, 0.19), uDarkMode);
  vec3 zCol = mix(vec3(0.30, 0.50, 0.72), vec3(0.22, 0.36, 0.52), uDarkMode);

  float a = max(max(gSub, g1), max(g5, g20));
  vec3 col = minorCol;
  if (g5 > g1 && g5 >= gSub) col = majorCol;
  if (g20 > g5) col = majorCol;
  if (rings > a * 0.75) {
    col = mix(col, ringCol, clamp(rings / max(a, rings), 0.0, 1.0));
    a = max(a, rings);
  }
  if (xAxis > 0.01) {
    float xa = xAxis * 0.62;
    col = mix(col, xCol, clamp(xa / max(a, xa), 0.0, 1.0));
    a = max(a, xa);
  }
  if (zAxis > 0.01) {
    float za = zAxis * 0.62;
    col = mix(col, zCol, clamp(za / max(a, za), 0.0, 1.0));
    a = max(a, za);
  }

  float finalAlpha = clamp(a * radialFade, 0.0, 0.85);
  if (finalAlpha <= 0.003) discard;
  gl_FragColor = vec4(col * uGridGain, finalAlpha);
}
`;

function Hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function CreateCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 生成 512×512 中性测试场混凝土地面贴图（漫反射 + 粗糙度），1 格 = 1 米。 */
function MakeGroundTextures() {
  const size = 512;
  const albedo = CreateCanvas(size, size);
  const rough = CreateCanvas(size, size);
  const actx = albedo.getContext("2d");
  const rctx = rough.getContext("2d");

  actx.fillStyle = "#6c6962";
  actx.fillRect(0, 0, size, size);
  rctx.fillStyle = "#e6e6e6";
  rctx.fillRect(0, 0, size, size);

  // 2×2 块 1m 板块的细微明暗错落
  const tiles = [
    [0, 0, 256, 256, "#6f6c64", "#e4e4e4"],
    [256, 0, 256, 256, "#69665f", "#ebebeb"],
    [0, 256, 256, 256, "#6a6760", "#eaeaea"],
    [256, 256, 256, 256, "#6e6b63", "#e3e3e3"],
  ];
  for (const [x, y, w, h, ac, rc] of tiles) {
    actx.fillStyle = ac; actx.fillRect(x, y, w, h);
    rctx.fillStyle = rc; rctx.fillRect(x, y, w, h);
  }

  // 细腻的矿物微粒与柔和斑驳（避免高频摩尔纹）
  for (let i = 0; i < 420; i += 1) {
    const x = Hash2(i, 1) * size;
    const y = Hash2(i, 2) * size;
    const rad = 6 + Hash2(i, 3) * 28;
    const bright = Hash2(i, 4) > 0.5;
    const alpha = 0.015 + Hash2(i, 5) * 0.025;
    actx.fillStyle = bright ? `rgba(218,214,202,${alpha})` : `rgba(28,26,23,${alpha})`;
    actx.beginPath(); actx.arc(x, y, rad, 0, Math.PI * 2); actx.fill();
    rctx.fillStyle = bright ? "rgba(255,255,255,0.035)" : "rgba(180,180,180,0.035)";
    rctx.beginPath(); rctx.arc(x, y, rad, 0, Math.PI * 2); rctx.fill();
  }

  // 极淡的 1m 板块伸缩缝
  actx.strokeStyle = "rgba(30, 29, 25, 0.16)";
  actx.lineWidth = 2;
  for (const pos of [0, 256]) {
    actx.beginPath(); actx.moveTo(pos, 0); actx.lineTo(pos, size); actx.stroke();
    actx.beginPath(); actx.moveTo(0, pos); actx.lineTo(size, pos); actx.stroke();
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(160, 160);
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(160, 160);
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

/** 标尺立柱正面的高清刻度贴图（0–3.0 m，0.5 m 主刻度 + 1.7 m 金色人眼标线）。 */
function MakeScaleRulerTexture() {
  const canvas = CreateCanvas(128, 768);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#222422";
  ctx.fillRect(0, 0, 128, 768);

  // 0.25m 斑马格条纹在左侧
  const pxPerM = 768 / 3.0;
  for (let q = 0; q < 12; q += 1) {
    const yBottom = 768 - q * (pxPerM * 0.25);
    const yTop = yBottom - pxPerM * 0.25;
    ctx.fillStyle = q % 2 === 0 ? "#484a45" : "#272926";
    ctx.fillRect(0, yTop, 28, pxPerM * 0.25);
  }

  // 每 0.5m 横线与米制标号
  ctx.font = '700 24px ui-monospace, Consolas, monospace';
  ctx.textBaseline = "middle";
  for (let m = 0.5; m <= 2.5; m += 0.5) {
    const y = Math.round(768 - m * pxPerM);
    const major = Math.abs(m - Math.round(m)) < 0.01;
    ctx.fillStyle = major ? "#d9d6ca" : "#8c8b80";
    ctx.fillRect(0, y - (major ? 2 : 1), major ? 128 : 64, major ? 4 : 2);
    if (major) {
      ctx.fillStyle = "#e6e4d8";
      ctx.fillText(`${m.toFixed(0)}m`, 40, y - 16);
    }
  }

  // 1.7m 人眼参考线（旧金色）
  const yEye = Math.round(768 - 1.7 * pxPerM);
  ctx.fillStyle = "#edca83";
  ctx.fillRect(0, yEye - 2, 128, 4);
  ctx.font = '700 20px ui-monospace, Consolas, monospace';
  ctx.fillText("1.7m", 38, yEye - 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 弹着点测试靶墙贴图（砖墙 / 木板 / 装甲钢板）。 */
function MakeTargetTexture(kind) {
  const size = 256;
  const canvas = CreateCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (kind === "brick") {
    ctx.fillStyle = "#7a7369";
    ctx.fillRect(0, 0, size, size);
    const rows = 8, cols = 4, rh = size / rows, cw = size / cols;
    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c += 1) {
        const shade = Math.round((Hash2(r, c) - 0.5) * 22);
        ctx.fillStyle = `rgb(${156 + shade}, ${118 + Math.round(shade * 0.7)}, ${98 + Math.round(shade * 0.6)})`;
        ctx.fillRect(c * cw + offset + 3, r * rh + 3, cw - 6, rh - 6);
      }
    }
  } else if (kind === "wood") {
    ctx.fillStyle = "#6c5742";
    ctx.fillRect(0, 0, size, size);
    const planks = 6, ph = size / planks;
    for (let p = 0; p < planks; p += 1) {
      const shade = Math.round((Hash2(p, 7) - 0.5) * 20);
      ctx.fillStyle = `rgb(${144 + shade}, ${116 + Math.round(shade * 0.8)}, ${84 + Math.round(shade * 0.6)})`;
      ctx.fillRect(0, p * ph + 2, size, ph - 4);
      ctx.fillStyle = "rgba(45,30,16,0.18)";
      for (let g = 0; g < 6; g += 1) ctx.fillRect(0, p * ph + 4 + Hash2(p, g + 20) * (ph - 8), size, 1.5);
    }
  } else {
    ctx.fillStyle = "#5c646b";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(225,232,238,0.22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.fillStyle = "#818a92";
    for (const x of [20, size - 20]) for (const y of [20, size - 20]) {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

/** 构造 1.75 m 士兵比例中性剪影（低面建筑感雕像，帮助直观判断粒子真实高度）。 */
function BuildScaleFigure(material) {
  const group = new THREE.Group();
  group.name = "ScaleFigure175";
  const Add = (geo, x, y, z) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  // 底座圆盘
  Add(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 24), 0, 0.02, 0);
  // 双腿
  Add(new THREE.CylinderGeometry(0.068, 0.056, 0.84, 12), -0.105, 0.46, 0);
  Add(new THREE.CylinderGeometry(0.068, 0.056, 0.84, 12), 0.105, 0.46, 0);
  // 躯干（略带军服肩宽轮廓）
  Add(new THREE.CylinderGeometry(0.185, 0.145, 0.56, 14), 0, 1.14, 0);
  // 双臂
  Add(new THREE.CylinderGeometry(0.052, 0.042, 0.56, 10), -0.24, 1.11, 0);
  Add(new THREE.CylinderGeometry(0.052, 0.042, 0.56, 10), 0.24, 1.11, 0);
  // 颈与头部
  Add(new THREE.CylinderGeometry(0.048, 0.055, 0.10, 10), 0, 1.46, 0);
  Add(new THREE.SphereGeometry(0.105, 16, 12), 0, 1.59, 0);
  // 钢盔檐轮廓（顶高精确落在 1.75 m）
  const helmet = new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
  Add(helmet, 0, 1.622, 0);
  return group;
}

export class VfxPreviewArena {
  constructor(studio) {
    this.studio = studio;
    this.mode = "range"; // "range" | "grid" | "dark"
    this.effectId = "FireMedium";
    this.gridVisible = true;
    this.textures = [];
    this.materials = [];
    this.geometries = [];
    this.groundUniforms = {
      uArenaFadeColor: { value: new THREE.Color(0.68, 0.76, 0.86) },
      uArenaFadeStart: { value: 46.0 },
      uArenaFadeEnd: { value: 148.0 },
      uArenaFadeEnabled: { value: 1.0 },
    };

    // 1. 用 320m 无缝地平线融合 PBR 地坪替换原本 12m 的悬空棕色小圆盘
    const groundTex = MakeGroundTextures();
    this.textures.push(groundTex.map, groundTex.roughnessMap);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundTex.map,
      roughnessMap: groundTex.roughnessMap,
      roughness: 0.96,
      metalness: 0.0,
    });
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uArenaFadeColor = this.groundUniforms.uArenaFadeColor;
      shader.uniforms.uArenaFadeStart = this.groundUniforms.uArenaFadeStart;
      shader.uniforms.uArenaFadeEnd = this.groundUniforms.uArenaFadeEnd;
      shader.uniforms.uArenaFadeEnabled = this.groundUniforms.uArenaFadeEnabled;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vArenaWorldPos;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvArenaWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uArenaFadeColor;\nuniform float uArenaFadeStart;\nuniform float uArenaFadeEnd;\nuniform float uArenaFadeEnabled;\nvarying vec3 vArenaWorldPos;")
        .replace("#include <dithering_fragment>",
          "float arenaDist = length(vArenaWorldPos.xz);\n"
          + "float arenaFade = smoothstep(uArenaFadeStart, uArenaFadeEnd, arenaDist) * uArenaFadeEnabled;\n"
          + "gl_FragColor.rgb = mix(gl_FragColor.rgb, uArenaFadeColor, arenaFade);\n"
          + "#include <dithering_fragment>");
    };
    groundMat.customProgramCacheKey = () => "vfx_arena_ground_v1";
    this.groundMat = groundMat;
    this.materials.push(groundMat);

    const groundGeo = new THREE.PlaneGeometry(320, 320, 1, 1).rotateX(-Math.PI / 2);
    this.geometries.push(groundGeo);
    this.padGeometry = groundGeo;
    this.flareGroundMat = this.studio.pad.material;
    this.studio.pad.geometry.dispose();
    this.studio.pad.geometry = groundGeo;
    this.studio.pad.material = groundMat;
    this.studio.pad.position.y = 0;
    this.studio.pad.receiveShadow = true;

    // 2. 用屏幕空间抗锯齿技术网格 + 同心测距环替换原本超出圆盘边缘的丑陋方形 GridHelper
    this.studio.grid.visible = false;
    this.gridUniforms = {
      uCamDist: { value: 8.5 },
      uGridGain: { value: 1.0 },
      uDarkMode: { value: 0.0 },
    };
    const gridGeo = new THREE.PlaneGeometry(320, 320, 1, 1).rotateX(-Math.PI / 2);
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: this.gridUniforms,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.geometries.push(gridGeo);
    this.materials.push(gridMat);
    this.gridMesh = new THREE.Mesh(gridGeo, gridMat);
    this.gridMesh.position.y = 0.005;
    this.gridMesh.renderOrder = 1;
    this.gridMesh.name = "VfxArenaGrid";
    this.studio.root.add(this.gridMesh);
    // 让 studio.SetGridVisible 只控制技术网格，不把整个测试地面删掉！
    this.studio.SetGridVisible = (on) => {
      this.gridVisible = !!on;
      this.SyncVisibility();
    };

    // 3. 测试场建筑参照组
    this.root = new THREE.Group();
    this.root.name = "VfxPreviewArenaProps";
    this.studio.root.add(this.root);

    this.BuildMaterials();
    this.BuildOriginPad();
    this.BuildRangeBay();
    this.BuildBlastMarkers();
    this.BuildImpactRig();
    this.BuildWaterRig();
    this.SyncVisibility();
  }

  BuildMaterials() {
    const Make = (opts) => {
      const m = new THREE.MeshStandardMaterial(opts);
      this.materials.push(m);
      return m;
    };
    this.matConcrete = Make({ color: 0x8e8b82, roughness: 0.90, metalness: 0.0 });
    this.matTrim = Make({ color: 0x5c5b55, roughness: 0.86, metalness: 0.08 });
    this.matDarkBay = Make({ color: 0x191b1d, roughness: 0.98, metalness: 0.0 });
    this.matMidBay = Make({ color: 0x74736c, roughness: 0.88, metalness: 0.0 });
    this.matSteel = Make({ color: 0x464a4e, roughness: 0.50, metalness: 0.55 });
    this.matTimber = Make({ color: 0x7e644a, roughness: 0.90, metalness: 0.0 });
    this.matFigure = Make({ color: 0x9b988e, roughness: 0.82, metalness: 0.02 });
    this.matGold = Make({ color: 0xd9b86c, roughness: 0.42, metalness: 0.35 });

    const rulerTex = MakeScaleRulerTexture();
    this.textures.push(rulerTex);
    this.matRuler = Make({
      map: rulerTex,
      emissive: 0xffffff,
      emissiveMap: rulerTex,
      emissiveIntensity: 0.22,
      roughness: 0.78,
      metalness: 0.05,
    });

    this.impactMats = {};
    for (const kind of ["brick", "wood", "metal"]) {
      const tex = MakeTargetTexture(kind);
      this.textures.push(tex);
      this.impactMats[kind] = Make({
        map: tex,
        roughness: kind === "metal" ? 0.42 : 0.88,
        metalness: kind === "metal" ? 0.62 : 0.0,
      });
    }
  }

  /** 原点发射底座（低矮压铸铁环与耐火垫，让火焰和烟柱落地扎实）。 */
  BuildOriginPad() {
    this.originPad = new THREE.Group();
    this.originPad.name = "ArenaOriginPad";
    const baseGeo = new THREE.CylinderGeometry(0.68, 0.74, 0.022, 36);
    const innerGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.025, 36);
    this.geometries.push(baseGeo, innerGeo);
    const rim = new THREE.Mesh(baseGeo, this.matSteel);
    rim.position.y = 0.011; rim.receiveShadow = true;
    const inner = new THREE.Mesh(innerGeo, this.matDarkBay);
    inner.position.y = 0.0125; inner.receiveShadow = true;
    this.originPad.add(rim, inner);
    this.root.add(this.originPad);
  }

  /** 常规/中小尺度特效的建筑级光照与反差测试湾（位于默认机位后方 +X/+Z，绝不遮挡原点）。 */
  BuildRangeBay() {
    this.rangeBay = new THREE.Group();
    this.rangeBay.name = "ArenaRangeBay";

    const sink = new PreviewSink();
    sink.SetSector("RangeBay");
    const Box = (mat, x, y, z, w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      sink.Add(mat, g);
    };

    // 主反差与照明检验墙（z = +5.8 m，面朝 -Z 镜头方向）
    Box("concrete", 1.2, 1.5, 5.8, 7.2, 3.0, 0.42);
    Box("trim", 1.2, 3.05, 5.8, 7.36, 0.12, 0.52);     // 顶压檐
    Box("trim", 1.2, 0.14, 5.75, 7.32, 0.28, 0.54);    // 墙脚底座
    // 嵌入式暗色哑光反差背板（左侧，白烟 / 亮焰在白天也能清晰读轮廓）
    Box("darkBay", -0.55, 1.56, 5.58, 3.1, 2.45, 0.04);
    // 嵌入式标准中灰光影验板（右侧，看火光衰减、色温与投影）
    Box("midBay", 2.95, 1.56, 5.58, 2.9, 2.45, 0.04);
    // 中灰验板上的 1m / 2m 细标线
    Box("gold", 2.95, 1.0, 5.555, 2.86, 0.025, 0.015);
    Box("gold", 2.95, 2.0, 5.555, 2.86, 0.025, 0.015);

    // 90° 侧翼回折墙（x = +4.9 m，承接斜向点光与阴影）
    Box("concrete", 4.9, 1.25, 3.3, 0.42, 2.5, 4.6);
    Box("trim", 4.9, 2.54, 3.3, 0.52, 0.1, 4.72);
    // 矮胸墙（height 1.15m，测试近地光影与低空烟气漫溢）
    Box("concrete", 4.9, 0.575, 0.2, 0.40, 1.15, 1.6);
    Box("trim", 4.9, 1.18, 0.2, 0.48, 0.08, 1.68);

    // 掩体方块与木箱（为原点火光 / 爆炸光提供立体投影物）
    Box("concrete", 2.75, 0.42, 2.65, 1.15, 0.84, 0.58);
    Box("timber", 3.55, 0.30, 2.45, 0.60, 0.60, 0.60);
    Box("concrete", -2.9, 0.38, 4.55, 1.4, 0.76, 0.50);

    // 外围 10m 测距短柱（帮助缩放视角时感知空间尺度）
    for (const [bx, bz] of [[-10, 0], [10, 0], [0, 10], [0, -10]]) {
      Box("trim", bx, 0.42, bz, 0.16, 0.84, 0.16);
      Box("gold", bx, 0.78, bz, 0.18, 0.06, 0.18);
    }

    const matMap = {
      concrete: this.matConcrete,
      trim: this.matTrim,
      darkBay: this.matDarkBay,
      midBay: this.matMidBay,
      timber: this.matTimber,
      gold: this.matGold,
    };
    const meshes = sink.Flush(this.rangeBay, { Get: (k) => matMap[k] }, { castShadow: true, receiveShadow: true });
    for (const m of meshes) this.geometries.push(m.geometry);

    // 1.75 m 士兵比例雕像（放在原点左后方 x = -2.45, z = +1.95，随时一目了然对比粒子高度）
    const figure = BuildScaleFigure(this.matFigure);
    figure.position.set(-2.45, 0, 1.95);
    figure.rotation.y = Math.PI + 0.45; // 微微面向镜头
    this.rangeBay.add(figure);

    // 3.0 m 标尺立柱（紧邻人形比例雕像左侧，微斜面向默认机位）
    const rulerGroup = new THREE.Group();
    rulerGroup.position.set(-3.15, 0, 1.95);
    rulerGroup.rotation.y = Math.PI + 0.38;
    const postGeo = new THREE.BoxGeometry(0.14, 3.0, 0.14);
    const faceGeo = new THREE.PlaneGeometry(0.28, 3.0);
    const footGeo = new THREE.BoxGeometry(0.44, 0.06, 0.44);
    this.geometries.push(postGeo, faceGeo, footGeo);
    const post = new THREE.Mesh(postGeo, this.matSteel);
    post.position.y = 1.5; post.castShadow = true; post.receiveShadow = true;
    const foot = new THREE.Mesh(footGeo, this.matTrim);
    foot.position.y = 0.03; foot.receiveShadow = true;
    const face = new THREE.Mesh(faceGeo, this.matRuler);
    face.position.set(0, 1.5, 0.075);
    rulerGroup.add(post, foot, face);
    this.rangeBay.add(rulerGroup);

    this.root.add(this.rangeBay);
  }

  /** 大尺度爆炸 / 航弹的开阔靶场标桩（r = 10m / 20m / 40m，避免近景墙遮挡爆炸球）。 */
  BuildBlastMarkers() {
    this.blastMarkers = new THREE.Group();
    this.blastMarkers.name = "ArenaBlastMarkers";
    const sink = new PreviewSink();
    sink.SetSector("BlastMarkers");
    const Box = (mat, x, y, z, w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      sink.Add(mat, g);
    };
    for (const r of [10, 20, 40]) {
      const h = r >= 40 ? 2.4 : r >= 20 ? 1.8 : 1.4;
      const w = r >= 40 ? 0.45 : 0.28;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        Box("concrete", dx * r, h * 0.5, dz * r, w, h, w);
        Box("gold", dx * r, h - 0.14, dz * r, w + 0.04, 0.12, w + 0.04);
      }
    }
    // 远距掩体矮墙（r = 14m，承接爆炸火光与阴影）
    Box("concrete", 8, 0.9, 12, 6.0, 1.8, 0.55);
    Box("concrete", -10, 0.9, 11, 5.0, 1.8, 0.55);
    const matMap = { concrete: this.matConcrete, gold: this.matGold };
    const meshes = sink.Flush(this.blastMarkers, { Get: (k) => matMap[k] }, { castShadow: true, receiveShadow: true });
    for (const m of meshes) this.geometries.push(m.geometry);
    this.root.add(this.blastMarkers);
  }

  /** 弹着点测试靶墙（砖墙 / 木板 / 钢板），正面精确贴齐 z = +0.02 m，承接 Impact 命中效果。 */
  BuildImpactRig() {
    this.impactRig = new THREE.Group();
    this.impactRig.name = "ArenaImpactTarget";
    const slabGeo = new THREE.BoxGeometry(2.6, 2.1, 0.26);
    this.geometries.push(slabGeo);
    this.impactSlab = new THREE.Mesh(slabGeo, this.impactMats.brick);
    this.impactSlab.position.set(0, 1.05, 0.15); // 前表面位于 z = 0.02
    this.impactSlab.castShadow = true;
    this.impactSlab.receiveShadow = true;
    this.impactRig.add(this.impactSlab);

    // 钢架边框与斜撑
    const sink = new PreviewSink();
    sink.SetSector("ImpactFrame");
    const Box = (x, y, z, w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      sink.Add("steel", g);
    };
    Box(-1.34, 1.08, 0.15, 0.08, 2.16, 0.32);
    Box(1.34, 1.08, 0.15, 0.08, 2.16, 0.32);
    Box(0, 2.14, 0.15, 2.76, 0.08, 0.32);
    Box(0, 0.04, 0.38, 2.84, 0.08, 0.86);
    for (const sx of [-1.25, 1.25]) Box(sx, 0.6, 0.62, 0.07, 1.2, 0.07);
    const meshes = sink.Flush(this.impactRig, { Get: () => this.matSteel }, { castShadow: true, receiveShadow: true });
    for (const m of meshes) this.geometries.push(m.geometry);
    this.root.add(this.impactRig);
  }

  /** 水面命中测试浅水池（r = 2.6m 带石砌池沿，仅 ImpactWater 启用）。 */
  BuildWaterRig() {
    this.waterRig = new THREE.Group();
    this.waterRig.name = "ArenaWaterBasin";
    const poolGeo = new THREE.CircleGeometry(2.6, 48).rotateX(-Math.PI / 2);
    const rimOuter = new THREE.CylinderGeometry(2.88, 2.96, 0.14, 48, 1, true);
    const rimTop = new THREE.RingGeometry(2.58, 2.88, 48).rotateX(-Math.PI / 2);
    const rimInner = new THREE.CylinderGeometry(2.58, 2.58, 0.14, 48, 1, true);
    this.geometries.push(poolGeo, rimOuter, rimTop, rimInner);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3b5866, roughness: 0.14, metalness: 0.32 });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x5c5b55, roughness: 0.88, side: THREE.BackSide });
    this.materials.push(waterMat, innerMat);
    const pool = new THREE.Mesh(poolGeo, waterMat);
    pool.position.y = 0.015; pool.receiveShadow = true;
    const outer = new THREE.Mesh(rimOuter, this.matConcrete);
    outer.position.y = 0.07; outer.castShadow = true; outer.receiveShadow = true;
    const top = new THREE.Mesh(rimTop, this.matConcrete);
    top.position.y = 0.14; top.receiveShadow = true;
    const inner = new THREE.Mesh(rimInner, innerMat);
    inner.position.y = 0.07; inner.receiveShadow = true;
    this.waterRig.add(pool, outer, top, inner);
    this.root.add(this.waterRig);
  }

  SetMode(mode) {
    if (!["range", "grid", "dark"].includes(mode)) return;
    this.mode = mode;
    const dark = mode === "dark";
    this.gridUniforms.uDarkMode.value = dark ? 1.0 : 0.0;
    this.groundMat.color.setHex(dark ? 0x36393d : 0xffffff);
    this.SyncVisibility();
  }

  SetEffect(effectId, { isFlare = false, isSoil = false } = {}) {
    this.effectId = effectId;
    this.isFlare = !!isFlare;
    this.isSoil = !!isSoil;
    if (/^ImpactBrick/.test(effectId)) this.impactSlab.material = this.impactMats.brick;
    else if (effectId === "ImpactWood") this.impactSlab.material = this.impactMats.wood;
    else if (effectId === "ImpactMetal") this.impactSlab.material = this.impactMats.metal;
    this.SyncVisibility();
  }

  SyncVisibility() {
    const id = this.effectId || "";
    const isFlare = !!this.isFlare;
    const isSoil = !!this.isSoil;
    const showProps = this.mode !== "grid" && !isFlare && !isSoil;
    const isLargeBlast = /^(Bomb|ExplosionMortar|ExplosionShell|ExplosionTank)/.test(id);
    const isImpactWall = /^Impact(Brick|Wood|Metal)/.test(id);
    const isWater = id === "ImpactWater";
    const hideOriginPad = isImpactWall || isWater || isFlare || isSoil || id === "Incoming" || id === "Empty" || id === "DustMotes";

    // 照明弹使用 1200m 专用地形，切回原中性哑光地面材质避免高频平铺与过亮反照
    this.studio.pad.material = isFlare ? this.flareGroundMat : this.groundMat;
    this.groundUniforms.uArenaFadeEnabled.value = isFlare ? 0.0 : 1.0;
    this.gridMesh.visible = this.gridVisible && !isFlare && !isSoil;
    this.root.visible = showProps;
    this.originPad.visible = showProps && !hideOriginPad && !isLargeBlast;
    this.rangeBay.visible = showProps && !isLargeBlast && !isWater;
    this.blastMarkers.visible = showProps && isLargeBlast;
    this.impactRig.visible = showProps && isImpactWall;
    this.waterRig.visible = showProps && isWater;
  }

  SyncEnvironment(horizonColor, outputExposure) {
    if (this.mode === "dark") {
      this.groundUniforms.uArenaFadeColor.value.setRGB(0.025, 0.027, 0.030);
    } else {
      this.groundUniforms.uArenaFadeColor.value.copy(horizonColor);
    }
    // 根据曝光自适应网格亮度，暗室保持克制低对比以免抢走特效焦点
    const exp = Math.max(0.15, Number(outputExposure) || 1);
    const target = this.mode === "dark" ? 0.55 : 0.68;
    this.gridUniforms.uGridGain.value = Math.min(1.4, Math.max(0.22, target / exp));
  }

  Update(orbitDist) {
    this.gridUniforms.uCamDist.value = Math.max(0.5, Number(orbitDist) || 8.5);
  }

  Dispose() {
    this.root.removeFromParent();
    this.gridMesh.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
