// 《燎原 · 敌后1937》 —— 程序化低多边形建模库。
//
// 职责：为地图上出现的一切实体生成 three.js 几何体，零外部美术资产。
// 风格：低多边形 + 强剪影 + 顶点色，不用贴图（仅旗面允许少量 CanvasTexture）。
// 配色统一在土黄 / 灰褐 / 暗红 / 墨绿的战地写实区间，不卡通、不鲜艳。
// 我方剪影：灰蓝布衣、斗笠、绑腿、步枪斜挎、队形松散；
// 敌方剪影：土黄制服、钢盔、上刺刀、行列整齐。
//
// 性能约定：
//   1. 一个模型的所有零件合并成 **一个** BufferGeometry（自带顶点色与风摆权重），
//      因此一个模型 = 一次 draw call；同类型共享缓存几何体，只 new Mesh。
//   2. 植被等大批量物件用 InstancedMesh。
//   3. 风摆写在 shader 里（aSway 属性 + 共享 uniform），不占 CPU。
//   4. 模块顶层无 DOM / WebGL 副作用，材质与几何体全部惰性创建。

import * as THREE from "three";
import { CreateRng, HashString, HexToWorld, ParseHexKey, Clamp, Lerp } from "./Script_Hex.mjs";

// --------------------------------------------------------------------------
// 调色板与全局风场（纯数据，可安全置于模块顶层）
// --------------------------------------------------------------------------

export const modelPalette = Object.freeze({
  loessWall: "#b4a077", loessDark: "#8d7c58", mudRoof: "#7c766b", tileRoof: "#5b5954",
  thatch: "#a8934f", straw: "#b79a52", rammedEarth: "#9c8a66", stone: "#8a8681", stoneDark: "#68655f",
  timber: "#6b543a", timberDark: "#4c3c2a", clothBlue: "#5f6d7c", clothBlueDark: "#47535f",
  legWrap: "#b3a789", strawHat: "#b59a5f", skin: "#a2795c", steel: "#8d949a", steelDark: "#5b6166",
  enemyKhaki: "#8a7a4c", enemyKhakiDark: "#6c5f39", helmet: "#5e6152", puppetGray: "#767a6d",
  bannerRed: "#8e2f2a", flagCloth: "#9b3a30", foliageDeep: "#3f5638", foliageMid: "#506441",
  foliageDry: "#6d7043", soil: "#7d6a4d", soilDark: "#5c4f38", rust: "#6d4f3a", rail: "#7b7d80",
  ballast: "#8a8378", roadDirt: "#9a8863", roadPaved: "#6f6a62", water: "#4c5f63",
  lampGlow: "#dcae62", paper: "#c7b795", charcoal: "#3a3733", ash: "#5a564f", ember: "#b8632f",
});

/** 全局风场 uniform：所有模型材质共享同一对象，每帧只写一次。 */
export const modelWindUniforms = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };

/** 由渲染循环（Script_Effects.Update）每帧调用一次即可驱动全部顶点动画。 */
export function TickModelWind(elapsed, strength = 1) {
  modelWindUniforms.uWindTime.value = elapsed;
  modelWindUniforms.uWindStrength.value = strength;
}

// --------------------------------------------------------------------------
// 缓存与共享材质
// --------------------------------------------------------------------------

const geometryCache = new Map();
const textureCache = new Map();
let sharedMaterial = null;
let sharedClothMaterial = null;

/** 往标准材质注入风摆：aSway.x = 权重，aSway.y = 模式（0 植被 / 1 旗布）。 */
function InjectSwayShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = modelWindUniforms.uWindTime;
    shader.uniforms.uWindStrength = modelWindUniforms.uWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aSway;\nuniform float uWindTime;\nuniform float uWindStrength;")
      .replace("#include <begin_vertex>", [
        "#include <begin_vertex>",
        "{",
        "  vec4 swayWorld = modelMatrix * vec4( transformed, 1.0 );",
        "  #ifdef USE_INSTANCING",
        "  swayWorld = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );",
        "  #endif",
        "  float swayPhase = swayWorld.x * 0.73 + swayWorld.z * 0.51;",
        "  float swayWeight = aSway.x * uWindStrength;",
        "  float swayTime = uWindTime;",
        "  if ( aSway.y > 0.5 ) {",
        "    transformed.z += sin( swayTime * 6.2 + aSway.x * 8.5 + swayPhase ) * swayWeight * 0.20;",
        "    transformed.y += sin( swayTime * 5.1 + aSway.x * 6.0 + swayPhase * 0.5 ) * swayWeight * 0.08;",
        "    transformed.x -= swayWeight * swayWeight * 0.05;",
        "  } else {",
        "    transformed.x += ( sin( swayTime * 1.55 + swayPhase ) * 0.052 + sin( swayTime * 3.17 + swayPhase * 1.9 ) * 0.019 ) * swayWeight;",
        "    transformed.z += cos( swayTime * 1.31 + swayPhase * 1.2 ) * swayWeight * 0.044;",
        "  }",
        "}",
      ].join("\n"));
  };
  material.customProgramCacheKey = () => "prairieSway";
}

/** 主材质：顶点色 + 平面着色 + 风摆。全部实体模型共用。 */
function GetModelMaterial() {
  if (sharedMaterial) return sharedMaterial;
  sharedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.03 });
  sharedMaterial.name = "PrairieModelMaterial";
  InjectSwayShader(sharedMaterial);
  return sharedMaterial;
}

/** 双面薄片材质：布料、旗面、告示牌。 */
function GetClothMaterial() {
  if (sharedClothMaterial) return sharedClothMaterial;
  sharedClothMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  sharedClothMaterial.name = "PrairieClothMaterial";
  InjectSwayShader(sharedClothMaterial);
  return sharedClothMaterial;
}

// --------------------------------------------------------------------------
// 几何零件工具：零件烘焙「位置 + 法线 + 顶点色 + 风摆权重」后合并
// --------------------------------------------------------------------------

function ApplyPieceTransform(geometry, spec) {
  const scale = spec.scale;
  if (scale !== undefined) {
    if (Array.isArray(scale)) geometry.scale(scale[0], scale[1], scale[2]);
    else geometry.scale(scale, scale, scale);
  }
  const rot = spec.rot;
  if (rot) {
    if (rot[0]) geometry.rotateX(rot[0]);
    if (rot[1]) geometry.rotateY(rot[1]);
    if (rot[2]) geometry.rotateZ(rot[2]);
  }
  const pos = spec.pos;
  if (pos) geometry.translate(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  return geometry;
}

/** 按三角面做确定性色调抖动，给低多边形表面一点脏旧的层次。 */
function AttachVertexColor(geometry, colorHex, variance) {
  const position = geometry.getAttribute("position");
  const count = position.count;
  const array = position.array;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(colorHex);
  base.convertSRGBToLinear();
  for (let triangle = 0; triangle < count; triangle += 3) {
    const index = triangle * 3;
    const hash = HashString(`${Math.round((array[index] + array[index + 3]) * 97)}|${Math.round((array[index + 1] + array[index + 4]) * 89)}|${Math.round((array[index + 2] + array[index + 5]) * 83)}`);
    const tint = 1 + (((hash & 1023) / 1023 - 0.5) * 2) * variance;
    for (let corner = 0; corner < 3; corner += 1) {
      const write = (triangle + corner) * 3;
      colors[write] = Clamp(base.r * tint, 0, 1);
      colors[write + 1] = Clamp(base.g * tint, 0, 1);
      colors[write + 2] = Clamp(base.b * tint, 0, 1);
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** 风摆权重：沿指定轴按归一化位置提权，flag 模式沿旗面长度线性提权。 */
function AttachSway(geometry, sway) {
  const position = geometry.getAttribute("position");
  const count = position.count;
  const values = new Float32Array(count * 2);
  if (sway) {
    const amount = sway.amount ?? 1;
    const base = sway.base ?? 0;
    const span = sway.span || 1;
    const mode = sway.mode === "flag" ? 1 : 0;
    const axis = sway.axis === "x" ? 0 : sway.axis === "z" ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const normalized = Clamp((position.array[index * 3 + axis] - base) / span, 0, 1);
      values[index * 2] = amount * (mode ? normalized : Math.pow(normalized, 1.45));
      values[index * 2 + 1] = mode;
    }
  }
  geometry.setAttribute("aSway", new THREE.BufferAttribute(values, 2));
}

function PushPiece(pieces, geometry, spec) {
  let baked = geometry;
  if (baked.index) { const flat = baked.toNonIndexed(); baked.dispose(); baked = flat; }
  if (baked.getAttribute("uv")) baked.deleteAttribute("uv");
  ApplyPieceTransform(baked, spec);
  AttachVertexColor(baked, spec.color || modelPalette.stone, spec.variance ?? 0.06);
  AttachSway(baked, spec.sway);
  pieces.push(baked);
  return baked;
}

const Box = (pieces, w, h, d, spec) => PushPiece(pieces, new THREE.BoxGeometry(w, h, d), spec);
const Cyl = (pieces, rTop, rBottom, h, seg, spec) => PushPiece(pieces, new THREE.CylinderGeometry(rTop, rBottom, h, seg), spec);
const Cone = (pieces, r, h, seg, spec) => PushPiece(pieces, new THREE.ConeGeometry(r, h, seg), spec);
const Ball = (pieces, r, spec) => PushPiece(pieces, new THREE.SphereGeometry(r, 7, 5), spec);
const Quad = (pieces, w, h, spec) => PushPiece(pieces, new THREE.PlaneGeometry(w, h, spec.segments || 1, 1), spec);
const Torus = (pieces, r, tube, spec) => PushPiece(pieces, new THREE.TorusGeometry(r, tube, 4, 9), spec);
const Ring = (pieces, inner, outer, seg, spec) => PushPiece(pieces, new THREE.RingGeometry(inner, outer, seg, 1, spec.arcStart || 0, spec.arcLength ?? Math.PI * 2), spec);

/** 三棱柱：坡屋顶专用，脊线沿 z 轴。 */
function Wedge(pieces, width, height, depth, spec) {
  const hw = width / 2;
  const hd = depth / 2;
  const vertices = [[-hw, 0, -hd], [hw, 0, -hd], [0, height, -hd], [-hw, 0, hd], [hw, 0, hd], [0, height, hd]];
  const faces = [[0, 2, 1], [3, 4, 5], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4], [0, 1, 4], [0, 4, 3]];
  const array = new Float32Array(faces.length * 9);
  let cursor = 0;
  for (const face of faces) {
    for (const vertexIndex of face) {
      const vertex = vertices[vertexIndex];
      array[cursor] = vertex[0]; array[cursor + 1] = vertex[1]; array[cursor + 2] = vertex[2];
      cursor += 3;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(array, 3));
  geometry.computeVertexNormals();
  return PushPiece(pieces, geometry, spec);
}

/** 合并零件为单一几何体（自实现，避免依赖 addons）。 */
function MergePieces(pieces) {
  let total = 0;
  for (const piece of pieces) total += piece.getAttribute("position").count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const sway = new Float32Array(total * 2);
  let written = 0;
  for (const piece of pieces) {
    const count = piece.getAttribute("position").count;
    position.set(piece.getAttribute("position").array.subarray(0, count * 3), written * 3);
    normal.set(piece.getAttribute("normal").array.subarray(0, count * 3), written * 3);
    color.set(piece.getAttribute("color").array.subarray(0, count * 3), written * 3);
    sway.set(piece.getAttribute("aSway").array.subarray(0, count * 2), written * 2);
    written += count;
    piece.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(color, 3));
  merged.setAttribute("aSway", new THREE.BufferAttribute(sway, 2));
  merged.computeBoundingSphere();
  return merged;
}

/** 取缓存几何体；builder 只在首次调用时执行。 */
function CachedGeometry(key, builder) {
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const pieces = [];
  builder(pieces);
  const merged = pieces.length ? MergePieces(pieces) : new THREE.BufferGeometry();
  geometryCache.set(key, merged);
  return merged;
}

function MakeGroup(name, geometry, material) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(geometry, material || GetModelMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${name}Mesh`;
  group.add(mesh);
  group.userData.modelKind = name;
  return group;
}

function SeedOf(options, fallback) {
  if (options && options.seed !== undefined) return HashString(String(options.seed));
  if (options && options.key) return HashString(String(options.key));
  return HashString(String(fallback));
}

// --------------------------------------------------------------------------
// 人物与装备
// --------------------------------------------------------------------------

const figureStyles = {
  guerrilla: { coat: modelPalette.clothBlue, trim: modelPalette.clothBlueDark, wrap: modelPalette.legWrap, hat: "cone", hatColor: modelPalette.strawHat, height: 1 },
  militia: { coat: "#7a7263", trim: "#63594b", wrap: modelPalette.legWrap, hat: "towel", hatColor: "#cdc2a6", height: 0.97 },
  regular: { coat: modelPalette.clothBlueDark, trim: "#3d4854", wrap: modelPalette.legWrap, hat: "cap", hatColor: "#4b5763", height: 1.04 },
  cadre: { coat: "#55606c", trim: "#414b55", wrap: "#a89c80", hat: "cap", hatColor: "#49535d", height: 1 },
  porter: { coat: "#8b8069", trim: "#6d6353", wrap: modelPalette.legWrap, hat: "towel", hatColor: "#c8bda2", height: 0.96 },
  enemy: { coat: modelPalette.enemyKhaki, trim: modelPalette.enemyKhakiDark, wrap: modelPalette.enemyKhakiDark, hat: "helmet", hatColor: modelPalette.helmet, height: 1.02 },
  puppet: { coat: modelPalette.puppetGray, trim: "#5f6357", wrap: "#8e8b78", hat: "cap", hatColor: "#585c50", height: 0.98 },
};

/** 造一个小人。标准身高 0.30（约 0.35 hexSize 的单位总高）。 */
function Figure(pieces, styleKey, options = {}) {
  const style = figureStyles[styleKey] || figureStyles.guerrilla;
  const x = options.x || 0, z = options.z || 0, facing = options.facing || 0, lean = options.lean || 0;
  const bodyHeight = 0.3 * (options.scale || 1) * style.height;
  const legHeight = bodyHeight * 0.36 * (options.crouch ? 0.72 : 1);
  const torsoHeight = bodyHeight * 0.36;
  const headSize = bodyHeight * 0.15;
  const width = bodyHeight * 0.24;
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const at = (dx, dy, dz) => [x + dx * cos - dz * sin, dy, z + dx * sin + dz * cos];

  for (const side of [-1, 1]) {
    Box(pieces, width * 0.38, legHeight * 0.55, width * 0.38, { pos: at(side * width * 0.26, legHeight * 0.28, 0), rot: [0, facing, 0], color: style.wrap });
    Box(pieces, width * 0.42, legHeight * 0.5, width * 0.42, { pos: at(side * width * 0.26, legHeight * 0.78, 0), rot: [0, facing, 0], color: style.trim });
  }
  Box(pieces, width, torsoHeight, width * 0.62, { pos: at(0, legHeight + torsoHeight * 0.5, lean * 0.01), rot: [lean * 0.16, facing, 0], color: style.coat });
  Box(pieces, width * 1.04, torsoHeight * 0.13, width * 0.66, { pos: at(0, legHeight + torsoHeight * 0.34, 0), rot: [0, facing, 0], color: style.trim });
  if (options.pack !== false) {
    Box(pieces, width * 0.72, torsoHeight * 0.44, width * 0.34, { pos: at(0, legHeight + torsoHeight * 0.72, -width * 0.44), rot: [0, facing, 0], color: options.packColor || modelPalette.soil });
  }
  const headY = legHeight + torsoHeight + headSize * 0.5;
  Box(pieces, headSize * 1.05, headSize, headSize, { pos: at(0, headY, 0), rot: [0, facing, 0], color: modelPalette.skin });
  const hatY = headY + headSize * 0.55;
  if (style.hat === "cone") {
    Cone(pieces, headSize * 1.5, headSize * 0.8, 7, { pos: at(0, hatY + headSize * 0.22, 0), color: style.hatColor });
  } else if (style.hat === "helmet") {
    Ball(pieces, headSize * 0.72, { pos: at(0, hatY + headSize * 0.02, 0), scale: [1, 0.72, 1], color: style.hatColor });
    Cyl(pieces, headSize * 1.02, headSize * 1.02, headSize * 0.12, 8, { pos: at(0, hatY - headSize * 0.12, 0), color: style.hatColor });
  } else if (style.hat === "towel") {
    Box(pieces, headSize * 1.2, headSize * 0.42, headSize * 1.16, { pos: at(0, hatY, 0), rot: [0, facing, 0], color: style.hatColor });
    Box(pieces, headSize * 0.3, headSize * 0.5, headSize * 0.2, { pos: at(headSize * 0.6, hatY - headSize * 0.2, -headSize * 0.3), rot: [0, facing, 0.4], color: style.hatColor });
  } else {
    Box(pieces, headSize * 1.16, headSize * 0.36, headSize * 1.1, { pos: at(0, hatY - headSize * 0.02, 0), rot: [0, facing, 0], color: style.hatColor });
    Box(pieces, headSize * 0.9, headSize * 0.12, headSize * 0.5, { pos: at(0, hatY - headSize * 0.16, headSize * 0.72), rot: [0, facing, 0], color: style.hatColor });
  }

  const weapon = options.weapon || "rifle";
  const shoulderY = legHeight + torsoHeight * 0.86;
  if (weapon === "rifle") {
    Box(pieces, bodyHeight * 0.55, width * 0.13, width * 0.13, { pos: at(-width * 0.1, shoulderY - bodyHeight * 0.08, -width * 0.3), rot: [0, facing, Math.PI * 0.34], color: modelPalette.timberDark });
  } else if (weapon === "bayonet") {
    Box(pieces, width * 0.12, bodyHeight * 0.6, width * 0.12, { pos: at(width * 0.42, legHeight + bodyHeight * 0.3, 0), rot: [0, facing, 0], color: modelPalette.timberDark });
    Box(pieces, width * 0.07, bodyHeight * 0.22, width * 0.07, { pos: at(width * 0.42, legHeight + bodyHeight * 0.68, 0), rot: [0, facing, 0], color: modelPalette.steel });
  } else if (weapon === "spear") {
    Box(pieces, width * 0.11, bodyHeight * 1.1, width * 0.11, { pos: at(width * 0.5, legHeight + bodyHeight * 0.42, 0), rot: [0, facing, -0.08], color: modelPalette.timber });
    Cone(pieces, width * 0.13, bodyHeight * 0.16, 5, { pos: at(width * 0.56, legHeight + bodyHeight * 1.02, 0), color: modelPalette.steel });
    Ball(pieces, width * 0.16, { pos: at(width * 0.55, legHeight + bodyHeight * 0.93, 0), scale: [1, 0.7, 1], color: modelPalette.bannerRed, sway: { amount: 0.4, span: 1 } });
  } else if (weapon === "pole") {
    Box(pieces, bodyHeight * 0.9, width * 0.11, width * 0.11, { pos: at(0, shoulderY + width * 0.16, 0), rot: [0, facing, 0.03], color: modelPalette.timber });
  } else if (weapon === "sabre") {
    Box(pieces, width * 0.09, bodyHeight * 0.34, width * 0.09, { pos: at(-width * 0.42, legHeight + bodyHeight * 0.2, 0), rot: [0, facing, 0.5], color: modelPalette.steel });
  }
}

/** 马：躯干 + 颈 + 头 + 四腿 + 尾，剪影足够辨识。 */
function Horse(pieces, x, z, facing, scale, color) {
  const cos = Math.cos(facing), sin = Math.sin(facing), s = scale;
  const at = (dx, dy, dz) => [x + dx * cos - dz * sin, dy, z + dx * sin + dz * cos];
  Box(pieces, 0.17 * s, 0.07 * s, 0.075 * s, { pos: at(0, 0.15 * s, 0), rot: [0, facing, 0], color });
  Box(pieces, 0.05 * s, 0.09 * s, 0.05 * s, { pos: at(0.085 * s, 0.2 * s, 0), rot: [0, facing, -0.5], color });
  Box(pieces, 0.06 * s, 0.04 * s, 0.04 * s, { pos: at(0.125 * s, 0.235 * s, 0), rot: [0, facing, 0.2], color });
  for (const dx of [-0.06, 0.06]) for (const dz of [-0.028, 0.028]) {
    Box(pieces, 0.022 * s, 0.12 * s, 0.022 * s, { pos: at(dx * s, 0.06 * s, dz * s), rot: [0, facing, 0], color });
  }
  Box(pieces, 0.02 * s, 0.07 * s, 0.02 * s, { pos: at(-0.09 * s, 0.16 * s, 0), rot: [0, facing, 0.5], color: modelPalette.charcoal });
}

/** 单位底座：六角矮台，颜色区分敌我。 */
function UnitPlinth(pieces, radius, color) {
  Cyl(pieces, radius, radius * 1.04, 0.022, 6, { pos: [0, 0.011, 0], color, variance: 0.03 });
  Cyl(pieces, radius * 0.86, radius * 0.86, 0.008, 6, { pos: [0, 0.026, 0], color: modelPalette.soilDark, variance: 0.02 });
}

/** 我方松散队形（有机、错落）。 */
function LooseFormation(count, rng, spread = 0.16) {
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + rng() * 1.1;
    const radius = spread * (0.45 + rng() * 0.75);
    slots.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * 0.85, facing: -0.5 + rng(), scale: 0.93 + rng() * 0.16 });
  }
  return slots;
}

/** 敌方整齐队列（行列对齐、朝向一致）。 */
function RankFormation(count, columns = 2, gap = 0.13) {
  const slots = [];
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    slots.push({ x: (column - (columns - 1) / 2) * gap, z: (row - (rows - 1) / 2) * gap, facing: 0, scale: 1 });
  }
  return slots;
}

// --------------------------------------------------------------------------
// 单位模型：我方 10 种
// --------------------------------------------------------------------------

const friendlyUnitBuilders = {
  /** 游击队：斗笠、斜挎枪、三人散开。 */
  Guerrilla(pieces, rng) {
    UnitPlinth(pieces, 0.24, "#6d4a3d");
    for (const slot of LooseFormation(3, rng, 0.15)) Figure(pieces, "guerrilla", { ...slot, weapon: "rifle", lean: 1 });
  },
  /** 民兵：白毛巾、红缨枪林立。 */
  Militia(pieces, rng) {
    UnitPlinth(pieces, 0.24, "#6d4a3d");
    LooseFormation(3, rng, 0.16).forEach((slot, index) => Figure(pieces, "militia", { ...slot, weapon: index === 2 ? "rifle" : "spear" }));
  },
  /** 主力：八角帽、四人两列、带旗。 */
  MainForce(pieces, rng) {
    UnitPlinth(pieces, 0.26, "#7a3b34");
    for (const slot of LooseFormation(4, rng, 0.17)) Figure(pieces, "regular", { ...slot, weapon: "rifle" });
    Box(pieces, 0.012, 0.3, 0.012, { pos: [0, 0.15, -0.16], color: modelPalette.timber });
    Quad(pieces, 0.14, 0.09, { pos: [0.07, 0.26, -0.16], segments: 4, color: modelPalette.flagCloth, sway: { amount: 1.1, span: 0.14, axis: "x", mode: "flag" } });
  },
  /** 工兵爆破组：炸药箱 + 导火索盘。 */
  Sapper(pieces, rng) {
    UnitPlinth(pieces, 0.23, "#6d4a3d");
    for (const slot of LooseFormation(2, rng, 0.13)) Figure(pieces, "guerrilla", { ...slot, weapon: "none", packColor: modelPalette.timberDark });
    Box(pieces, 0.11, 0.07, 0.08, { pos: [0.02, 0.035, 0.14], rot: [0, 0.3, 0], color: modelPalette.timberDark });
    Box(pieces, 0.115, 0.012, 0.085, { pos: [0.02, 0.072, 0.14], rot: [0, 0.3, 0], color: modelPalette.rust });
    Torus(pieces, 0.045, 0.008, { pos: [-0.13, 0.012, 0.1], rot: [Math.PI / 2, 0, 0], color: modelPalette.charcoal });
  },
  /** 骑兵：马匹剪影最好认。 */
  Cavalry(pieces, rng) {
    UnitPlinth(pieces, 0.27, "#7a3b34");
    for (const slot of LooseFormation(2, rng, 0.16)) {
      Horse(pieces, slot.x, slot.z, slot.facing, 1, "#54463a");
      Figure(pieces, "regular", { x: slot.x, z: slot.z, facing: slot.facing, weapon: "sabre", scale: 0.72, crouch: true });
    }
  },
  /** 担架队：两人抬担架，不做伤情细节。 */
  Medic(pieces) {
    UnitPlinth(pieces, 0.24, "#6d4a3d");
    Figure(pieces, "porter", { x: 0, z: -0.11, weapon: "none", pack: false });
    Figure(pieces, "porter", { x: 0, z: 0.11, weapon: "none", pack: false });
    Box(pieces, 0.055, 0.012, 0.26, { pos: [0, 0.15, 0], color: modelPalette.timber });
    Box(pieces, 0.075, 0.02, 0.2, { pos: [0, 0.163, 0], color: "#c3b89c" });
    Figure(pieces, "porter", { x: 0.19, z: 0.06, facing: 0.4, weapon: "none", scale: 0.94, packColor: "#8e8f79" });
  },
  /** 武工队 / 侦察：低姿、望远镜。 */
  Scout(pieces, rng) {
    UnitPlinth(pieces, 0.22, "#6d4a3d");
    const slots = LooseFormation(2, rng, 0.12);
    slots.forEach((slot, index) => Figure(pieces, "guerrilla", { ...slot, crouch: index === 0, weapon: "rifle", scale: 0.96 }));
    Box(pieces, 0.05, 0.018, 0.018, { pos: [slots[0].x + 0.05, 0.205, slots[0].z], rot: [0, slots[0].facing, 0], color: modelPalette.charcoal });
  },
  /** 工作队：布告牌是剪影主角。 */
  WorkTeam(pieces, rng) {
    UnitPlinth(pieces, 0.23, "#6d4a3d");
    for (const slot of LooseFormation(2, rng, 0.13)) Figure(pieces, "cadre", { ...slot, weapon: "none", packColor: "#7d6f56" });
    Box(pieces, 0.011, 0.24, 0.011, { pos: [0.13, 0.12, -0.05], color: modelPalette.timber });
    Quad(pieces, 0.13, 0.09, { pos: [0.13, 0.22, -0.05], color: modelPalette.paper });
    Box(pieces, 0.1, 0.006, 0.004, { pos: [0.13, 0.235, -0.046], color: modelPalette.charcoal });
    Box(pieces, 0.08, 0.006, 0.004, { pos: [0.12, 0.215, -0.046], color: modelPalette.charcoal });
  },
  /** 运输队：扁担挑子。 */
  Porter(pieces, rng) {
    UnitPlinth(pieces, 0.24, "#6d4a3d");
    for (const slot of LooseFormation(2, rng, 0.14)) {
      Figure(pieces, "porter", { ...slot, weapon: "pole", pack: false });
      const cos = Math.cos(slot.facing), sin = Math.sin(slot.facing);
      for (const side of [-1, 1]) {
        const bx = slot.x + side * 0.11 * cos, bz = slot.z + side * 0.11 * sin;
        Box(pieces, 0.006, 0.05, 0.006, { pos: [bx, 0.2, bz], color: modelPalette.timber });
        Cyl(pieces, 0.045, 0.032, 0.045, 7, { pos: [bx, 0.16, bz], color: modelPalette.straw });
      }
    }
  },
  /** 迫击炮组：抬高的炮管与两脚架。 */
  Mortar(pieces, rng) {
    UnitPlinth(pieces, 0.24, "#7a3b34");
    for (const slot of LooseFormation(2, rng, 0.14)) Figure(pieces, "regular", { ...slot, crouch: true, weapon: "none" });
    Box(pieces, 0.09, 0.014, 0.09, { pos: [0, 0.012, 0.02], color: modelPalette.steelDark });
    Cyl(pieces, 0.016, 0.02, 0.17, 7, { pos: [0, 0.09, -0.01], rot: [-0.5, 0, 0], color: modelPalette.steelDark });
    Box(pieces, 0.006, 0.1, 0.006, { pos: [0.035, 0.05, 0.05], rot: [0.35, 0, -0.3], color: modelPalette.steel });
    Box(pieces, 0.006, 0.1, 0.006, { pos: [-0.035, 0.05, 0.05], rot: [0.35, 0, 0.3], color: modelPalette.steel });
  },
};

// --------------------------------------------------------------------------
// 单位模型：敌方 8 种
// --------------------------------------------------------------------------

const enemyUnitBuilders = {
  /** 日军步兵：钢盔、上刺刀、两列纵队。 */
  EnemyInfantry(pieces) {
    UnitPlinth(pieces, 0.25, "#43464e");
    for (const slot of RankFormation(4, 2, 0.13)) Figure(pieces, "enemy", { ...slot, weapon: "bayonet" });
  },
  /** 守备队：沙袋工事后的固定队列。 */
  EnemyGarrison(pieces) {
    UnitPlinth(pieces, 0.25, "#43464e");
    for (const slot of RankFormation(3, 3, 0.12)) Figure(pieces, "enemy", { ...slot, weapon: "bayonet", scale: 0.98 });
    for (let index = 0; index < 4; index += 1) {
      Cyl(pieces, 0.032, 0.034, 0.03, 6, { pos: [-0.09 + index * 0.06, 0.017, 0.16], rot: [0, 0, Math.PI / 2], color: "#93876a" });
    }
  },
  /** 伪军：杂色、队形略散。 */
  EnemyPuppet(pieces, rng) {
    UnitPlinth(pieces, 0.24, "#4c4f47");
    for (const slot of RankFormation(3, 2, 0.13)) Figure(pieces, "puppet", { ...slot, facing: (rng() - 0.5) * 0.5, weapon: "rifle" });
  },
  /** 日军骑兵。 */
  EnemyCavalry(pieces) {
    UnitPlinth(pieces, 0.27, "#43464e");
    for (const slot of RankFormation(2, 2, 0.19)) {
      Horse(pieces, slot.x, slot.z, 0, 1, "#4a4038");
      Figure(pieces, "enemy", { x: slot.x, z: slot.z, weapon: "sabre", scale: 0.72, crouch: true });
    }
  },
  /** 装甲车：方正车体 + 炮塔 + 六轮。 */
  EnemyArmor(pieces) {
    UnitPlinth(pieces, 0.28, "#43464e");
    Box(pieces, 0.34, 0.09, 0.17, { pos: [0, 0.09, 0], color: "#6b6a55" });
    Wedge(pieces, 0.17, 0.06, 0.17, { pos: [0.13, 0.135, 0], rot: [0, 0, -0.9], color: "#63624f" });
    Box(pieces, 0.34, 0.03, 0.185, { pos: [0, 0.055, 0], color: modelPalette.steelDark });
    Cyl(pieces, 0.062, 0.07, 0.055, 8, { pos: [-0.03, 0.162, 0], color: "#6f6e58" });
    Cyl(pieces, 0.012, 0.012, 0.16, 6, { pos: [0.06, 0.168, 0], rot: [0, 0, Math.PI / 2], color: modelPalette.steelDark });
    for (let index = 0; index < 3; index += 1) for (const side of [-1, 1]) {
      Cyl(pieces, 0.036, 0.036, 0.026, 8, { pos: [-0.1 + index * 0.1, 0.038, side * 0.088], rot: [Math.PI / 2, 0, 0], color: modelPalette.charcoal });
    }
    Box(pieces, 0.03, 0.02, 0.03, { pos: [-0.03, 0.196, 0], color: modelPalette.steelDark });
  },
  /** 野炮：大车轮 + 长管 + 分开的大架。 */
  EnemyArtillery(pieces) {
    UnitPlinth(pieces, 0.27, "#43464e");
    for (const side of [-1, 1]) {
      Torus(pieces, 0.06, 0.011, { pos: [0, 0.062, side * 0.09], rot: [Math.PI / 2, 0, 0], color: modelPalette.timberDark });
      for (let spoke = 0; spoke < 4; spoke += 1) {
        Box(pieces, 0.006, 0.11, 0.006, { pos: [0, 0.062, side * 0.09], rot: [0, 0, (spoke * Math.PI) / 4], color: modelPalette.timberDark });
      }
      Box(pieces, 0.16, 0.012, 0.014, { pos: [-0.08, 0.03, side * 0.05], rot: [0, side * 0.28, 0.12], color: "#5f5f4c" });
    }
    Cyl(pieces, 0.015, 0.019, 0.22, 8, { pos: [0.06, 0.085, 0], rot: [0, 0, Math.PI / 2 - 0.16], color: modelPalette.steelDark });
    Box(pieces, 0.05, 0.055, 0.13, { pos: [-0.01, 0.075, 0], color: "#63624f" });
    Quad(pieces, 0.11, 0.08, { pos: [0.03, 0.09, 0], rot: [0, Math.PI / 2, 0], color: "#6b6a55" });
    Figure(pieces, "enemy", { x: -0.12, z: 0.1, facing: -0.6, weapon: "none", scale: 0.92, crouch: true });
    Figure(pieces, "enemy", { x: -0.12, z: -0.1, facing: 0.6, weapon: "none", scale: 0.92 });
  },
  /** 工兵 / 修路队：手推车与工具。 */
  EnemyEngineer(pieces) {
    UnitPlinth(pieces, 0.24, "#4c4f47");
    for (const slot of RankFormation(2, 2, 0.15)) Figure(pieces, "enemy", { ...slot, weapon: "none", scale: 0.98 });
    Box(pieces, 0.13, 0.05, 0.09, { pos: [0, 0.06, 0.15], color: modelPalette.timberDark });
    Cyl(pieces, 0.03, 0.03, 0.02, 8, { pos: [0.02, 0.03, 0.21], rot: [Math.PI / 2, 0, 0], color: modelPalette.charcoal });
    Box(pieces, 0.008, 0.13, 0.008, { pos: [-0.08, 0.07, 0.1], rot: [0.4, 0, 0.5], color: modelPalette.timber });
    Box(pieces, 0.05, 0.01, 0.012, { pos: [-0.11, 0.13, 0.08], rot: [0, 0, 0.4], color: modelPalette.steel });
  },
  /** 宪兵 / 特务：长衣、告示牌。 */
  EnemyGendarme(pieces) {
    UnitPlinth(pieces, 0.23, "#4c4f47");
    for (const slot of RankFormation(2, 2, 0.14)) {
      Figure(pieces, "enemy", { ...slot, weapon: "none", scale: 1.02 });
      Box(pieces, 0.075, 0.09, 0.055, { pos: [slot.x, 0.13, slot.z], color: "#726646" });
    }
    Box(pieces, 0.01, 0.2, 0.01, { pos: [0.14, 0.1, 0.02], color: modelPalette.timber });
    Quad(pieces, 0.1, 0.07, { pos: [0.14, 0.185, 0.02], color: modelPalette.paper });
    Box(pieces, 0.07, 0.005, 0.004, { pos: [0.14, 0.2, 0.024], color: modelPalette.bannerRed });
  },
  /** 辎重队：驮马与粮车。 */
  EnemySupply(pieces) {
    UnitPlinth(pieces, 0.26, "#4c4f47");
    Horse(pieces, -0.06, 0, 0, 0.9, "#5a4d3f");
    Box(pieces, 0.15, 0.06, 0.11, { pos: [0.13, 0.075, 0], color: modelPalette.timberDark });
    for (const side of [-1, 1]) Cyl(pieces, 0.038, 0.038, 0.014, 9, { pos: [0.14, 0.04, side * 0.06], rot: [Math.PI / 2, 0, 0], color: modelPalette.timber });
    Box(pieces, 0.12, 0.045, 0.09, { pos: [0.13, 0.125, 0], color: "#8b7d5c" });
    Figure(pieces, "enemy", { x: 0.02, z: 0.14, weapon: "rifle", scale: 0.95 });
  },
};

/**
 * 单位类型别名表。前半段是 Data_Units.mjs 里真实的 18 个 key（权威来源），
 * 后半段是通用同义词，用于容错。改 Data_Units 的 key 时必须同步这里。
 */
const unitAliases = {
  // —— Data_Units.mjs 我方 10 种 ——
  GuerrillaSquad: "Guerrilla",
  MilitiaSelfDefence: "Militia",
  Scout: "Scout",
  DistrictSquad: "Guerrilla",
  CountyCompany: "MainForce",
  MainForceCompany: "MainForce",
  DemolitionTeam: "Sapper",
  StretcherMedicTeam: "Medic",
  CavalryCourier: "Cavalry",
  ArmedWorkTeam: "WorkTeam",
  // —— Data_Units.mjs 敌方 8 种 ——
  JapaneseInfantryCompany: "EnemyInfantry",
  PunitiveColumn: "EnemyInfantry",
  PuppetGarrison: "EnemyPuppet",
  GendarmeDetachment: "EnemyGendarme",
  ArmouredCarSection: "EnemyArmor",
  CavalrySearchTroop: "EnemyCavalry",
  EngineerPlatoon: "EnemyEngineer",
  ArtilleryDetachment: "EnemyArtillery",
  // —— 通用同义词（容错） ——
  Partisan: "Guerrilla", Regular: "MainForce", Main: "MainForce", Veteran: "MainForce",
  Engineer: "Sapper", Demolition: "Sapper", Horse: "Cavalry", Stretcher: "Medic", Nurse: "Medic",
  Recon: "Scout", Cadre: "WorkTeam", Propaganda: "WorkTeam", Transport: "Porter",
  Supply: "Porter", Artillery: "Mortar", Gun: "Mortar", Japanese: "EnemyInfantry", Infantry: "EnemyInfantry",
  Garrison: "EnemyGarrison", Puppet: "EnemyPuppet", Collaborator: "EnemyPuppet", Armor: "EnemyArmor",
  ArmoredCar: "EnemyArmor", Tank: "EnemyArmor", EnemyGun: "EnemyArtillery", Gendarme: "EnemyGendarme",
  Kempeitai: "EnemyGendarme", Convoy: "EnemySupply",
};

/**
 * 生成单位模型。unitType 支持我方 10 种、敌方 8 种及别名；
 * 未知类型按阵营降级为 Guerrilla / EnemyInfantry。
 * options: { variant, scale, faction }
 */
export function CreateUnitModel(unitType, options = {}) {
  const requested = String(unitType || "Guerrilla");
  const resolved = unitAliases[requested] || requested;
  const isEnemy = options.faction === "Enemy" || (options.faction !== "Player" && (resolved.startsWith("Enemy") || /^(Japanese|Puppet)/.test(requested)));
  let builder = friendlyUnitBuilders[resolved] || enemyUnitBuilders[resolved];
  let name = resolved;
  if (!builder) {
    name = isEnemy ? "EnemyInfantry" : "Guerrilla";
    builder = isEnemy ? enemyUnitBuilders.EnemyInfantry : friendlyUnitBuilders.Guerrilla;
  }
  const variant = Math.abs(Math.floor(options.variant ?? 0)) % 3;
  const geometry = CachedGeometry(`unit:${name}:${variant}`, (pieces) => builder(pieces, CreateRng(HashString(`${name}:${variant}`))));
  const group = MakeGroup(name, geometry);
  group.userData.faction = isEnemy ? "Enemy" : "Player";
  group.userData.unitType = requested;
  group.userData.height = 0.35;
  if (options.scale && options.scale !== 1) group.scale.setScalar(options.scale);
  return group;
}

// --------------------------------------------------------------------------
// 聚落：村庄 / 集镇 / 县城 / 炮楼
// --------------------------------------------------------------------------

/** 华北土坯房：夯土墙 + 平顶或缓坡顶 + 木门。 */
function EarthHouse(pieces, x, z, width, depth, height, angle, roofKind, tint) {
  Box(pieces, width, height, depth, { pos: [x, height / 2, z], rot: [0, angle, 0], color: tint || modelPalette.loessWall });
  if (roofKind === "flat") {
    Box(pieces, width * 1.08, height * 0.09, depth * 1.08, { pos: [x, height + height * 0.045, z], rot: [0, angle, 0], color: modelPalette.mudRoof });
    Box(pieces, width * 0.3, height * 0.16, depth * 0.3, { pos: [x + width * 0.24, height + height * 0.11, z], rot: [0, angle, 0], color: modelPalette.loessDark });
  } else if (roofKind === "tile") {
    Wedge(pieces, width * 1.16, height * 0.44, depth * 1.14, { pos: [x, height, z], rot: [0, angle, 0], color: modelPalette.tileRoof });
  } else {
    Wedge(pieces, width * 1.14, height * 0.4, depth * 1.12, { pos: [x, height, z], rot: [0, angle, 0], color: modelPalette.thatch, variance: 0.1 });
  }
  Box(pieces, width * 0.26, height * 0.55, 0.01, { pos: [x + Math.sin(angle) * depth * 0.5, height * 0.275, z + Math.cos(angle) * depth * 0.5], rot: [0, angle, 0], color: modelPalette.timberDark });
}

function StrawStack(pieces, x, z, radius, height) {
  Cyl(pieces, radius * 0.86, radius, height * 0.6, 7, { pos: [x, height * 0.3, z], color: modelPalette.straw, variance: 0.12 });
  Cone(pieces, radius * 1.02, height * 0.5, 7, { pos: [x, height * 0.82, z], color: modelPalette.straw, variance: 0.12 });
}

function CourtyardWall(pieces, x, z, width, depth, angle, height, color) {
  Box(pieces, width, height, 0.028, { pos: [x, height / 2, z - depth / 2], rot: [0, angle, 0], color });
  Box(pieces, 0.028, height, depth, { pos: [x - width / 2, height / 2, z], rot: [0, angle, 0], color });
  Box(pieces, width * 0.4, height, 0.028, { pos: [x - width * 0.28, height / 2, z + depth / 2], rot: [0, angle, 0], color });
}

function SmallTree(pieces, x, z, height, kind) {
  if (kind === "pine") {
    Box(pieces, 0.016, height * 0.4, 0.016, { pos: [x, height * 0.2, z], color: modelPalette.timberDark });
    Cone(pieces, height * 0.3, height * 0.5, 6, { pos: [x, height * 0.55, z], color: modelPalette.foliageDeep, sway: { amount: 0.5, base: height * 0.3, span: height * 0.5 } });
    Cone(pieces, height * 0.22, height * 0.38, 6, { pos: [x, height * 0.82, z], color: modelPalette.foliageDeep, sway: { amount: 0.8, base: height * 0.3, span: height * 0.6 } });
  } else if (kind === "poplar") {
    Box(pieces, 0.014, height * 0.62, 0.014, { pos: [x, height * 0.31, z], color: "#8b8168" });
    Ball(pieces, height * 0.24, { pos: [x, height * 0.78, z], scale: [0.72, 1.25, 0.72], color: modelPalette.foliageMid, sway: { amount: 0.9, base: height * 0.45, span: height * 0.6 } });
  } else {
    Box(pieces, 0.018, height * 0.4, 0.018, { pos: [x, height * 0.2, z], color: modelPalette.timber });
    Ball(pieces, height * 0.3, { pos: [x, height * 0.62, z], scale: [1.1, 0.82, 1.1], color: kind === "dry" ? modelPalette.foliageDry : modelPalette.foliageMid, sway: { amount: 0.85, base: height * 0.35, span: height * 0.5 } });
  }
}

/** 村庄：几户土坯房 + 院墙 + 草垛 + 老树 + 碾盘井台。 */
export function CreateVillageModel(scale = 1, options = {}) {
  const seed = SeedOf(options, "village");
  const density = Clamp(options.density ?? 1, 0.4, 1.6);
  const geometry = CachedGeometry(`village:${seed & 0xff}:${Math.round(density * 4)}`, (pieces) => {
    const rng = CreateRng(seed);
    const houseCount = Math.round(Lerp(3, 6, Clamp((density - 0.4) / 1.2, 0, 1)));
    for (let index = 0; index < houseCount; index += 1) {
      const angle = (index / houseCount) * Math.PI * 2 + rng() * 0.7;
      const radius = 0.14 + rng() * 0.24;
      EarthHouse(pieces, Math.cos(angle) * radius, Math.sin(angle) * radius * 0.9, 0.15 + rng() * 0.09, 0.12 + rng() * 0.06, 0.12 + rng() * 0.06, rng() * Math.PI, rng() > 0.55 ? "flat" : "thatch");
    }
    CourtyardWall(pieces, 0.02, 0.06, 0.34, 0.3, rng() * 0.4, 0.055, modelPalette.loessDark);
    StrawStack(pieces, -0.28, 0.2, 0.055, 0.13);
    StrawStack(pieces, 0.3, -0.14, 0.045, 0.1);
    SmallTree(pieces, 0.32, 0.22, 0.28, "poplar");
    SmallTree(pieces, -0.3, -0.2, 0.24, rng() > 0.5 ? "broad" : "poplar");
    Cyl(pieces, 0.05, 0.052, 0.018, 9, { pos: [0.02, 0.009, -0.02], color: modelPalette.stone });
    Cyl(pieces, 0.02, 0.02, 0.035, 7, { pos: [0.04, 0.026, -0.02], rot: [0, 0, Math.PI / 2], color: modelPalette.stoneDark });
    Torus(pieces, 0.032, 0.009, { pos: [-0.16, 0.012, 0.24], rot: [Math.PI / 2, 0, 0], color: modelPalette.stoneDark });
  });
  const group = MakeGroup("Village", geometry);
  group.scale.setScalar(scale);
  group.userData.height = 0.3 * scale;
  return group;
}

/** 集镇：夯土围墙一角 + 二层楼 + 瓦顶排屋 + 市集棚。 */
export function CreateTownModel(scale = 1, options = {}) {
  const seed = SeedOf(options, "town");
  const geometry = CachedGeometry(`town:${seed & 0x3f}`, (pieces) => {
    const rng = CreateRng(seed);
    Box(pieces, 0.86, 0.1, 0.036, { pos: [0, 0.05, -0.4], color: modelPalette.rammedEarth });
    Box(pieces, 0.036, 0.1, 0.8, { pos: [-0.42, 0.05, 0], color: modelPalette.rammedEarth });
    for (let index = 0; index < 9; index += 1) {
      const x = -0.32 + (index % 3) * 0.3 + (rng() - 0.5) * 0.06;
      const z = -0.24 + Math.floor(index / 3) * 0.26 + (rng() - 0.5) * 0.06;
      EarthHouse(pieces, x, z, 0.19 + rng() * 0.06, 0.15, 0.14 + rng() * 0.05, rng() > 0.5 ? 0 : Math.PI / 2, "tile");
    }
    Box(pieces, 0.22, 0.3, 0.18, { pos: [0.06, 0.15, 0.02], color: modelPalette.loessWall });
    Box(pieces, 0.25, 0.02, 0.21, { pos: [0.06, 0.18, 0.02], color: modelPalette.timberDark });
    Wedge(pieces, 0.28, 0.1, 0.22, { pos: [0.06, 0.3, 0.02], color: modelPalette.tileRoof });
    for (let index = 0; index < 3; index += 1) {
      const x = -0.3 + index * 0.14;
      Box(pieces, 0.008, 0.09, 0.008, { pos: [x, 0.045, 0.34], color: modelPalette.timber });
      Box(pieces, 0.008, 0.09, 0.008, { pos: [x, 0.045, 0.26], color: modelPalette.timber });
      Quad(pieces, 0.12, 0.1, { pos: [x, 0.096, 0.3], rot: [-Math.PI / 2, 0, 0], color: index % 2 ? "#9a8d6e" : "#8d7f63", sway: { amount: 0.25, base: 0.09, span: 0.02 } });
    }
    SmallTree(pieces, -0.36, 0.3, 0.3, "poplar");
    SmallTree(pieces, 0.38, -0.28, 0.26, "broad");
  });
  const group = MakeGroup("Town", geometry);
  group.scale.setScalar(scale);
  group.userData.height = 0.42 * scale;
  return group;
}

/** 县城：夯土城墙 + 垛口 + 角楼 + 城门楼 + 鼓楼 + 内城街区。 */
export function CreateCountySeatModel(scale = 1, options = {}) {
  const seed = SeedOf(options, "countySeat");
  const geometry = CachedGeometry(`countySeat:${seed & 0x1f}`, (pieces) => {
    const rng = CreateRng(seed);
    const half = 0.46;
    const wallHeight = 0.17;
    for (const side of [{ x: 0, z: -half, w: half * 2, d: 0.05 }, { x: 0, z: half, w: half * 2, d: 0.05 }, { x: -half, z: 0, w: 0.05, d: half * 2 }, { x: half, z: 0, w: 0.05, d: half * 2 }]) {
      Box(pieces, side.w, wallHeight, side.d, { pos: [side.x, wallHeight / 2, side.z], color: modelPalette.rammedEarth });
    }
    for (let index = 0; index < 13; index += 1) {
      const t = -half + (index / 12) * half * 2;
      Box(pieces, 0.05, 0.035, 0.05, { pos: [t, wallHeight + 0.017, -half], color: modelPalette.rammedEarth });
      Box(pieces, 0.05, 0.035, 0.05, { pos: [t, wallHeight + 0.017, half], color: modelPalette.rammedEarth });
      Box(pieces, 0.05, 0.035, 0.05, { pos: [-half, wallHeight + 0.017, t], color: modelPalette.rammedEarth });
      Box(pieces, 0.05, 0.035, 0.05, { pos: [half, wallHeight + 0.017, t], color: modelPalette.rammedEarth });
    }
    for (const cx of [-half, half]) for (const cz of [-half, half]) {
      Box(pieces, 0.1, wallHeight * 1.35, 0.1, { pos: [cx, wallHeight * 0.675, cz], color: modelPalette.loessDark });
      Wedge(pieces, 0.14, 0.05, 0.14, { pos: [cx, wallHeight * 1.35, cz], color: modelPalette.tileRoof });
    }
    Box(pieces, 0.24, wallHeight * 1.2, 0.12, { pos: [0, wallHeight * 0.6, half], color: modelPalette.rammedEarth });
    Box(pieces, 0.08, wallHeight * 0.7, 0.14, { pos: [0, wallHeight * 0.35, half], color: modelPalette.charcoal });
    Box(pieces, 0.26, 0.09, 0.14, { pos: [0, wallHeight * 1.25, half], color: modelPalette.loessWall });
    Wedge(pieces, 0.32, 0.08, 0.18, { pos: [0, wallHeight * 1.29 + 0.045, half], color: modelPalette.tileRoof });
    Wedge(pieces, 0.24, 0.06, 0.14, { pos: [0, wallHeight * 1.29 + 0.115, half], color: modelPalette.tileRoof });
    Box(pieces, 0.16, 0.16, 0.16, { pos: [0, 0.08, 0], color: modelPalette.rammedEarth });
    Box(pieces, 0.06, 0.09, 0.14, { pos: [0, 0.05, 0], color: modelPalette.charcoal });
    Wedge(pieces, 0.26, 0.06, 0.2, { pos: [0, 0.16, 0], color: modelPalette.tileRoof });
    Box(pieces, 0.12, 0.11, 0.12, { pos: [0, 0.22, 0], color: modelPalette.loessWall });
    Wedge(pieces, 0.2, 0.06, 0.16, { pos: [0, 0.33, 0], color: modelPalette.tileRoof });
    Box(pieces, 0.012, 0.1, 0.012, { pos: [0, 0.42, 0], color: modelPalette.timber });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = 0.24 + rng() * 0.1;
      EarthHouse(pieces, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.14, 0.12, 0.11 + rng() * 0.04, index % 2 ? 0 : Math.PI / 2, "tile");
    }
  });
  const group = MakeGroup("CountySeat", geometry);
  group.scale.setScalar(scale);
  group.userData.height = 0.55 * scale;
  return group;
}

/** 炮楼：日军据点标志物。收分塔身 + 射孔 + 挑出平台 + 铁丝网 + 外壕。 */
export function CreateBlockhouseModel(scale = 1, options = {}) {
  const tier = Clamp(Math.round(options.tier ?? 1), 1, 3);
  const geometry = CachedGeometry(`blockhouse:${tier}`, (pieces) => {
    // 塔身高度控制在 0.48–0.6，加上土基、平台、旗杆后总高约 0.78–0.9，
    // 既是全图最高的敌方地标，又不越出建筑 0.3–0.9 的高度带。
    const height = 0.42 + tier * 0.06;
    Cyl(pieces, 0.2, 0.26, 0.05, 8, { pos: [0, 0.025, 0], color: modelPalette.soilDark });
    Cyl(pieces, 0.115, 0.155, height, 8, { pos: [0, 0.05 + height / 2, 0], color: "#9b937f", variance: 0.09 });
    for (let level = 0; level < tier + 1; level += 1) {
      const y = 0.16 + level * (height / (tier + 1.4));
      for (let side = 0; side < 4; side += 1) {
        const angle = (side / 4) * Math.PI * 2 + Math.PI / 8;
        Box(pieces, 0.03, 0.026, 0.03, { pos: [Math.cos(angle) * 0.14, y, Math.sin(angle) * 0.14], rot: [0, -angle, 0], color: modelPalette.charcoal });
      }
    }
    const topY = 0.05 + height;
    Cyl(pieces, 0.16, 0.15, 0.028, 8, { pos: [0, topY + 0.014, 0], color: "#8a8270" });
    for (let side = 0; side < 8; side += 1) {
      const angle = (side / 8) * Math.PI * 2;
      Box(pieces, 0.05, 0.045, 0.03, { pos: [Math.cos(angle) * 0.135, topY + 0.05, Math.sin(angle) * 0.135], rot: [0, -angle, 0], color: "#8a8270" });
    }
    Cone(pieces, 0.15, 0.07, 8, { pos: [0, topY + 0.1, 0], color: modelPalette.tileRoof });
    Box(pieces, 0.008, 0.13, 0.008, { pos: [0, topY + 0.19, 0], color: modelPalette.steelDark });
    Quad(pieces, 0.07, 0.05, { pos: [0.035, topY + 0.22, 0], segments: 3, color: "#a8a49b", sway: { amount: 0.9, span: 0.07, axis: "x", mode: "flag" } });
    for (let post = 0; post < 10; post += 1) {
      const angle = (post / 10) * Math.PI * 2;
      const nextAngle = ((post + 1) / 10) * Math.PI * 2;
      const x = Math.cos(angle) * 0.34, z = Math.sin(angle) * 0.34;
      const nx = Math.cos(nextAngle) * 0.34, nz = Math.sin(nextAngle) * 0.34;
      Box(pieces, 0.008, 0.07, 0.008, { pos: [x, 0.035, z], rot: [0.12, -angle, 0.1], color: modelPalette.timberDark });
      Box(pieces, Math.hypot(nx - x, nz - z), 0.004, 0.004, { pos: [(x + nx) / 2, 0.056, (z + nz) / 2], rot: [0, -Math.atan2(nz - z, nx - x), 0], color: modelPalette.rust });
    }
    Ring(pieces, 0.28, 0.32, 14, { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0], color: modelPalette.soilDark });
  });
  const group = MakeGroup("Blockhouse", geometry);
  group.scale.setScalar(scale);
  group.userData.height = (0.72 + tier * 0.06) * scale;
  group.userData.tier = tier;
  return group;
}

// --------------------------------------------------------------------------
// 根据地区域（12 种）
// --------------------------------------------------------------------------

function WorkShed(pieces, x, z, width, depth, height, color, roofColor) {
  Box(pieces, width, height, depth, { pos: [x, height / 2, z], color: color || modelPalette.loessWall });
  Wedge(pieces, width * 1.1, height * 0.36, depth * 1.1, { pos: [x, height, z], color: roofColor || modelPalette.mudRoof });
}

const districtBuilders = {
  /** 兵工厂：作坊 + 烟囱 + 炉火 + 铁砧。 */
  Arsenal(pieces) {
    WorkShed(pieces, -0.06, 0, 0.3, 0.2, 0.14, "#a2957c", modelPalette.tileRoof);
    Cyl(pieces, 0.028, 0.034, 0.26, 7, { pos: [0.14, 0.13, -0.06], color: "#7c7266" });
    Box(pieces, 0.07, 0.05, 0.06, { pos: [0.14, 0.028, 0.08], color: modelPalette.charcoal });
    Box(pieces, 0.045, 0.03, 0.04, { pos: [0.14, 0.062, 0.08], color: modelPalette.ember });
    Box(pieces, 0.05, 0.035, 0.045, { pos: [-0.18, 0.018, 0.12], rot: [0, 0.4, 0], color: modelPalette.steelDark });
  },
  /** 被服厂：长工棚 + 晾布架（布幅随风摆）。 */
  TextileMill(pieces) {
    WorkShed(pieces, 0, -0.08, 0.34, 0.16, 0.12, "#a89b80", modelPalette.mudRoof);
    for (let index = 0; index < 3; index += 1) {
      const x = -0.14 + index * 0.14;
      Box(pieces, 0.008, 0.14, 0.008, { pos: [x, 0.07, 0.14], color: modelPalette.timber });
      Quad(pieces, 0.12, 0.1, { pos: [x + 0.06, 0.09, 0.14], rot: [0, Math.PI / 2, 0], segments: 3, color: index % 2 ? "#9fa38f" : "#b0a58a", sway: { amount: 0.8, base: 0.04, span: 0.1, mode: "flag" } });
    }
    Box(pieces, 0.14, 0.008, 0.008, { pos: [-0.07, 0.14, 0.14], color: modelPalette.timber });
  },
  /** 卫生所：小院 + 布帘 + 药碾。 */
  Clinic(pieces) {
    WorkShed(pieces, 0, -0.05, 0.24, 0.18, 0.13, "#b0a68d", modelPalette.tileRoof);
    Quad(pieces, 0.16, 0.11, { pos: [0, 0.075, 0.05], segments: 3, color: "#cec5ae", sway: { amount: 0.4, base: 0.02, span: 0.1, mode: "flag" } });
    Cyl(pieces, 0.045, 0.045, 0.012, 10, { pos: [0.16, 0.006, 0.12], color: modelPalette.stone });
    Cyl(pieces, 0.03, 0.03, 0.02, 8, { pos: [0.16, 0.02, 0.12], rot: [Math.PI / 2, 0, 0], color: modelPalette.stoneDark });
    SmallTree(pieces, -0.18, 0.16, 0.2, "broad");
  },
  /** 夜校：黑板与灯笼。 */
  NightSchool(pieces) {
    WorkShed(pieces, 0, 0, 0.28, 0.2, 0.13, modelPalette.loessWall, modelPalette.mudRoof);
    Quad(pieces, 0.16, 0.09, { pos: [0, 0.09, 0.101], color: modelPalette.charcoal });
    Box(pieces, 0.14, 0.004, 0.004, { pos: [0, 0.06, 0.105], color: "#cfc9b6" });
    Box(pieces, 0.008, 0.1, 0.008, { pos: [-0.15, 0.16, 0.09], color: modelPalette.timber });
    Ball(pieces, 0.026, { pos: [-0.15, 0.2, 0.09], scale: [1, 1.2, 1], color: modelPalette.lampGlow });
    Box(pieces, 0.1, 0.012, 0.05, { pos: [0.08, 0.03, 0.16], color: modelPalette.timberDark });
  },
  /** 粮站：粮囤 + 席墙。 */
  GrainDepot(pieces) {
    for (const spot of [[-0.12, -0.04, 0.07], [0.08, 0.02, 0.085], [0, 0.16, 0.06]]) {
      Cyl(pieces, spot[2] * 0.92, spot[2], 0.14, 9, { pos: [spot[0], 0.07, spot[1]], color: "#b3a173", variance: 0.09 });
      Cone(pieces, spot[2] * 1.12, 0.06, 9, { pos: [spot[0], 0.17, spot[1]], color: modelPalette.straw });
    }
    Box(pieces, 0.3, 0.06, 0.02, { pos: [0, 0.03, -0.16], color: "#9c8f6d" });
    Box(pieces, 0.08, 0.05, 0.06, { pos: [0.2, 0.025, -0.1], color: modelPalette.timberDark });
  },
  /** 交通站：路标 + 拴马桩 + 小屋。 */
  CourierStation(pieces) {
    WorkShed(pieces, -0.06, 0, 0.2, 0.16, 0.12, modelPalette.loessWall, modelPalette.mudRoof);
    Box(pieces, 0.01, 0.24, 0.01, { pos: [0.16, 0.12, 0.04], color: modelPalette.timber });
    Box(pieces, 0.1, 0.024, 0.006, { pos: [0.2, 0.21, 0.04], color: modelPalette.paper });
    Box(pieces, 0.08, 0.02, 0.006, { pos: [0.19, 0.175, 0.04], color: "#a89c7f" });
    for (const x of [0.06, 0.13]) Box(pieces, 0.012, 0.07, 0.012, { pos: [x, 0.035, -0.15], color: modelPalette.timberDark });
    Box(pieces, 0.09, 0.008, 0.008, { pos: [0.095, 0.066, -0.15], color: modelPalette.timberDark });
  },
  /** 兵站：货堆与篷布。 */
  SupplyDepot(pieces) {
    for (const crate of [[-0.1, -0.04, 0], [-0.03, -0.02, 1], [0.06, 0.04, 0], [-0.06, 0.08, 1]]) {
      Box(pieces, 0.09, 0.06, 0.07, { pos: [crate[0], 0.03 + crate[2] * 0.06, crate[1]], rot: [0, crate[2] * 0.4, 0], color: crate[2] ? modelPalette.timberDark : modelPalette.timber });
    }
    Box(pieces, 0.008, 0.13, 0.008, { pos: [0.16, 0.065, -0.1], color: modelPalette.timber });
    Box(pieces, 0.008, 0.13, 0.008, { pos: [0.16, 0.065, 0.1], color: modelPalette.timber });
    Quad(pieces, 0.22, 0.16, { pos: [0.16, 0.135, 0], rot: [-Math.PI / 2, 0, Math.PI / 2], segments: 3, color: "#8d8265", sway: { amount: 0.3, base: 0.12, span: 0.04 } });
  },
  /** 地道口：土坡下的木框洞口，掩以柴草。 */
  TunnelEntrance(pieces) {
    Cyl(pieces, 0.14, 0.2, 0.07, 8, { pos: [0, 0.035, 0], color: modelPalette.soil });
    Box(pieces, 0.09, 0.075, 0.02, { pos: [0, 0.04, 0.14], color: modelPalette.timberDark });
    Box(pieces, 0.06, 0.055, 0.03, { pos: [0, 0.03, 0.15], color: "#241f1b" });
    Box(pieces, 0.012, 0.09, 0.012, { pos: [-0.05, 0.045, 0.14], color: modelPalette.timber });
    Box(pieces, 0.012, 0.09, 0.012, { pos: [0.05, 0.045, 0.14], color: modelPalette.timber });
    StrawStack(pieces, 0.14, -0.08, 0.05, 0.11);
    Box(pieces, 0.1, 0.012, 0.07, { pos: [-0.12, 0.075, -0.06], rot: [0.2, 0.5, 0.1], color: modelPalette.foliageDry });
  },
  /** 电台：天线杆与拉线。 */
  RadioStation(pieces) {
    WorkShed(pieces, -0.04, 0.02, 0.2, 0.16, 0.12, "#9d947e", modelPalette.mudRoof);
    Box(pieces, 0.012, 0.36, 0.012, { pos: [0.12, 0.18, -0.04], color: modelPalette.steelDark });
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      Box(pieces, 0.2, 0.004, 0.004, { pos: [0.12 + Math.cos(angle) * 0.045, 0.2, -0.04 + Math.sin(angle) * 0.045], rot: [0, -angle, 0.9], color: "#6f6a5e" });
    }
    Box(pieces, 0.05, 0.04, 0.035, { pos: [0.02, 0.02, 0.12], color: modelPalette.charcoal });
    Box(pieces, 0.01, 0.05, 0.01, { pos: [0.035, 0.06, 0.12], rot: [0, 0, 0.3], color: modelPalette.steel });
  },
  /** 靶场：土坎 + 靶子。 */
  Range(pieces) {
    Box(pieces, 0.44, 0.09, 0.06, { pos: [0, 0.045, -0.18], color: modelPalette.soil });
    for (let index = 0; index < 3; index += 1) {
      const x = -0.14 + index * 0.14;
      Box(pieces, 0.01, 0.09, 0.01, { pos: [x, 0.045, -0.13], color: modelPalette.timber });
      Quad(pieces, 0.07, 0.07, { pos: [x, 0.11, -0.13], color: "#c8bda1" });
      Cyl(pieces, 0.014, 0.014, 0.002, 8, { pos: [x, 0.11, -0.128], rot: [Math.PI / 2, 0, 0], color: modelPalette.bannerRed });
    }
    Box(pieces, 0.3, 0.02, 0.05, { pos: [0, 0.01, 0.16], color: "#8f8368" });
  },
  /** 农会：院门 + 布告栏 + 旗。 */
  FarmersAssociation(pieces) {
    CourtyardWall(pieces, 0, 0, 0.34, 0.28, 0, 0.075, modelPalette.loessDark);
    WorkShed(pieces, -0.02, -0.06, 0.22, 0.14, 0.12, modelPalette.loessWall, modelPalette.tileRoof);
    Box(pieces, 0.012, 0.11, 0.012, { pos: [-0.09, 0.055, 0.14], color: modelPalette.timber });
    Box(pieces, 0.012, 0.11, 0.012, { pos: [0.09, 0.055, 0.14], color: modelPalette.timber });
    Box(pieces, 0.2, 0.018, 0.02, { pos: [0, 0.11, 0.14], color: modelPalette.timberDark });
    Quad(pieces, 0.11, 0.075, { pos: [0.16, 0.1, 0.05], rot: [0, Math.PI / 2, 0], color: modelPalette.paper });
    Box(pieces, 0.01, 0.26, 0.01, { pos: [-0.18, 0.13, 0.1], color: modelPalette.timber });
    Quad(pieces, 0.11, 0.07, { pos: [-0.125, 0.23, 0.1], segments: 4, color: modelPalette.flagCloth, sway: { amount: 1, span: 0.11, axis: "x", mode: "flag" } });
  },
  /** 民兵训练场：木障碍 + 桩阵 + 旗杆。 */
  MilitiaGround(pieces) {
    Box(pieces, 0.4, 0.008, 0.3, { pos: [0, 0.004, 0], color: "#93855f" });
    for (const x of [-0.12, 0.02]) {
      Box(pieces, 0.012, 0.11, 0.012, { pos: [x, 0.055, -0.1], color: modelPalette.timber });
      Box(pieces, 0.012, 0.11, 0.012, { pos: [x, 0.055, 0.02], color: modelPalette.timber });
      Box(pieces, 0.014, 0.014, 0.13, { pos: [x, 0.105, -0.04], color: modelPalette.timberDark });
    }
    for (let index = 0; index < 5; index += 1) {
      Box(pieces, 0.018, 0.07 + (index % 2) * 0.03, 0.018, { pos: [0.1 + (index % 3) * 0.05, 0.04, 0.05 + Math.floor(index / 3) * 0.06], color: modelPalette.timberDark });
    }
    Box(pieces, 0.01, 0.3, 0.01, { pos: [-0.18, 0.15, 0.1], color: modelPalette.timber });
    Quad(pieces, 0.1, 0.065, { pos: [-0.13, 0.27, 0.1], segments: 4, color: modelPalette.flagCloth, sway: { amount: 1, span: 0.1, axis: "x", mode: "flag" } });
  },
};

const districtAliases = {
  Clothing: "TextileMill", Textile: "TextileMill", Hospital: "Clinic", Medical: "Clinic", School: "NightSchool",
  Granary: "GrainDepot", Grain: "GrainDepot", Courier: "CourierStation", Station: "CourierStation",
  Depot: "SupplyDepot", Tunnel: "TunnelEntrance", Radio: "RadioStation", Telegraph: "RadioStation",
  ShootingRange: "Range", Farmers: "FarmersAssociation", Association: "FarmersAssociation",
  Militia: "MilitiaGround", TrainingGround: "MilitiaGround", Smithy: "Arsenal", Workshop: "Arsenal",
};

/** 根据地区域小建筑（12 种 + 别名），未知类型退化为兵站货堆。 */
export function CreateDistrictModel(districtType, options = {}) {
  const requested = String(districtType || "SupplyDepot");
  const resolved = districtAliases[requested] || requested;
  const name = districtBuilders[resolved] ? resolved : "SupplyDepot";
  const geometry = CachedGeometry(`district:${name}`, (pieces) => districtBuilders[name](pieces));
  const group = MakeGroup(`District${name}`, geometry);
  group.userData.districtType = requested;
  group.userData.height = 0.32;
  if (options.scale && options.scale !== 1) group.scale.setScalar(options.scale);
  if (options.rotation) group.rotation.y = options.rotation;
  return group;
}

// --------------------------------------------------------------------------
// 工事与改良
// --------------------------------------------------------------------------

const workBuilders = {
  /** 梯田：随等高线层层退台，作物成行。 */
  Terrace(pieces) {
    for (let level = 0; level < 4; level += 1) {
      const radius = 0.5 - level * 0.1;
      const y = level * 0.032;
      Ring(pieces, radius - 0.085, radius, 18, { pos: [0, y + 0.004, 0], rot: [-Math.PI / 2, 0, 0], arcStart: Math.PI * 0.15, arcLength: Math.PI * 1.7, color: level % 2 ? "#94854f" : "#a08f57" });
      Cyl(pieces, radius, radius, 0.03, 18, { pos: [0, y - 0.012, 0], color: modelPalette.soilDark, variance: 0.04 });
      for (let crop = 0; crop < 9; crop += 1) {
        const angle = Math.PI * 0.2 + (crop / 9) * Math.PI * 1.6;
        Box(pieces, 0.02, 0.03, 0.02, { pos: [Math.cos(angle) * (radius - 0.04), y + 0.02, Math.sin(angle) * (radius - 0.04)], color: modelPalette.foliageDry, sway: { amount: 0.7, base: y, span: 0.035 } });
      }
    }
  },
  /** 战壕：折线壕沟 + 胸墙 + 木撑。 */
  Trench(pieces) {
    const points = [[-0.4, -0.12], [-0.18, 0.06], [0.04, -0.1], [0.26, 0.08], [0.44, -0.04]];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index], b = points[index + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      Box(pieces, length, 0.05, 0.09, { pos: [mx, -0.018, mz], rot: [0, -angle, 0], color: "#3f3629" });
      Box(pieces, length, 0.045, 0.05, { pos: [mx + Math.sin(angle) * 0.075, 0.022, mz - Math.cos(angle) * 0.075], rot: [0, -angle, 0], color: modelPalette.soil });
      Box(pieces, 0.014, 0.06, 0.014, { pos: [a[0], 0.02, a[1]], color: modelPalette.timberDark });
    }
    Box(pieces, 0.09, 0.05, 0.05, { pos: [0.04, 0.03, -0.16], color: "#867a5c" });
  },
  /** 地道口（地块工事层的小型版）。 */
  Tunnel(pieces) {
    Cyl(pieces, 0.1, 0.15, 0.055, 8, { pos: [0, 0.028, 0], color: modelPalette.soil });
    Box(pieces, 0.07, 0.055, 0.018, { pos: [0, 0.03, 0.1], color: modelPalette.timberDark });
    Box(pieces, 0.045, 0.04, 0.026, { pos: [0, 0.022, 0.11], color: "#221e1a" });
    Box(pieces, 0.09, 0.01, 0.06, { pos: [-0.08, 0.06, -0.05], rot: [0.15, 0.5, 0.1], color: modelPalette.foliageDry });
  },
  /** 铁匠炉：石砌炉膛 + 风箱 + 铁砧。 */
  Smithy(pieces) {
    Box(pieces, 0.12, 0.09, 0.1, { pos: [0, 0.045, 0], color: modelPalette.stoneDark });
    Box(pieces, 0.06, 0.04, 0.05, { pos: [0, 0.055, 0.05], color: modelPalette.ember });
    Cyl(pieces, 0.018, 0.022, 0.14, 6, { pos: [-0.04, 0.14, -0.03], color: "#6f675c" });
    Box(pieces, 0.08, 0.05, 0.05, { pos: [0.13, 0.025, 0.02], color: modelPalette.timberDark });
    Box(pieces, 0.05, 0.03, 0.035, { pos: [-0.13, 0.015, 0.05], color: modelPalette.steelDark });
    Box(pieces, 0.028, 0.03, 0.028, { pos: [-0.13, 0.045, 0.05], color: modelPalette.steel });
  },
  /** 物资囤：苫盖的箱垛与筐。 */
  Cache(pieces) {
    Box(pieces, 0.1, 0.06, 0.08, { pos: [-0.04, 0.03, 0], color: modelPalette.timber });
    Box(pieces, 0.09, 0.055, 0.075, { pos: [0.05, 0.028, 0.03], rot: [0, 0.4, 0], color: modelPalette.timberDark });
    Box(pieces, 0.085, 0.05, 0.07, { pos: [-0.02, 0.085, 0.01], rot: [0, 0.2, 0], color: modelPalette.timber });
    Cyl(pieces, 0.04, 0.032, 0.05, 7, { pos: [0.11, 0.025, -0.06], color: modelPalette.straw });
    Quad(pieces, 0.2, 0.16, { pos: [0, 0.12, 0], rot: [-Math.PI / 2 + 0.2, 0, 0.1], segments: 3, color: "#8b8064", sway: { amount: 0.25, base: 0.1, span: 0.04 } });
  },
  /** 烽火台：方形石台 + 火笼。 */
  Beacon(pieces) {
    Box(pieces, 0.2, 0.05, 0.2, { pos: [0, 0.025, 0], color: modelPalette.stoneDark });
    Box(pieces, 0.15, 0.16, 0.15, { pos: [0, 0.13, 0], color: modelPalette.stone });
    Box(pieces, 0.17, 0.03, 0.17, { pos: [0, 0.225, 0], color: modelPalette.stoneDark });
    for (let post = 0; post < 4; post += 1) {
      const angle = (post / 4) * Math.PI * 2 + Math.PI / 4;
      Box(pieces, 0.01, 0.08, 0.01, { pos: [Math.cos(angle) * 0.05, 0.27, Math.sin(angle) * 0.05], rot: [0.12, -angle, 0.12], color: modelPalette.charcoal });
    }
    Cyl(pieces, 0.05, 0.035, 0.05, 7, { pos: [0, 0.3, 0], color: modelPalette.charcoal });
    Cone(pieces, 0.036, 0.06, 6, { pos: [0, 0.34, 0], color: "#c07a33" });
  },
  /** 路障：交叉木桩 + 石堆。 */
  Barricade(pieces) {
    for (let index = 0; index < 3; index += 1) {
      const x = -0.18 + index * 0.18;
      Box(pieces, 0.012, 0.16, 0.012, { pos: [x, 0.06, 0], rot: [0.6, 0, 0.3], color: modelPalette.timber });
      Box(pieces, 0.012, 0.16, 0.012, { pos: [x, 0.06, 0], rot: [-0.6, 0, -0.3], color: modelPalette.timber });
    }
    Box(pieces, 0.42, 0.008, 0.008, { pos: [0, 0.09, 0], color: modelPalette.timberDark });
    for (let stone = 0; stone < 5; stone += 1) {
      Ball(pieces, 0.022 + (stone % 3) * 0.008, { pos: [-0.2 + stone * 0.1, 0.016, 0.1 + (stone % 2) * 0.05], scale: [1, 0.7, 1.1], color: modelPalette.stone });
    }
  },
  /** 渡口：木栈桥 + 渡船 + 撑杆。 */
  Ford(pieces) {
    Box(pieces, 0.24, 0.012, 0.1, { pos: [-0.1, 0.03, 0], color: modelPalette.timber });
    for (const x of [-0.2, -0.1, 0]) for (const z of [-0.04, 0.04]) {
      Box(pieces, 0.012, 0.06, 0.012, { pos: [x, 0.006, z], color: modelPalette.timberDark });
    }
    Box(pieces, 0.2, 0.03, 0.08, { pos: [0.16, 0.018, 0.02], rot: [0, 0.15, 0], color: modelPalette.timberDark });
    Box(pieces, 0.18, 0.012, 0.012, { pos: [0.16, 0.04, 0.02], rot: [0, 0.15, 0], color: modelPalette.timber });
    Box(pieces, 0.008, 0.16, 0.008, { pos: [0.1, 0.09, 0.05], rot: [0, 0, 0.35], color: modelPalette.timber });
    Cyl(pieces, 0.014, 0.014, 0.09, 6, { pos: [-0.26, 0.045, 0.08], color: modelPalette.timberDark });
  },
};

const workAliases = { Trenches: "Trench", Terraces: "Terrace", TunnelMouth: "Tunnel", Roadblock: "Barricade", Crossing: "Ford", Watchtower: "Beacon" };

/** 工事 / 改良模型：梯田、战壕、地道口、铁匠炉、物资囤、烽火台、路障、渡口。 */
export function CreateWorkModel(workType, options = {}) {
  const requested = String(workType || "Trench");
  const resolved = workAliases[requested] || requested;
  const name = workBuilders[resolved] ? resolved : "Cache";
  const geometry = CachedGeometry(`work:${name}`, (pieces) => workBuilders[name](pieces));
  const group = MakeGroup(`Work${name}`, geometry);
  group.userData.workType = requested;
  if (options.scale && options.scale !== 1) group.scale.setScalar(options.scale);
  if (options.rotation) group.rotation.y = options.rotation;
  return group;
}

// --------------------------------------------------------------------------
// 线性设施：铁路、道路
// --------------------------------------------------------------------------

/**
 * 铁轨段：fromKey 中心 → toKey 中心。
 * Group 已定位在两格中点（y = 0）、朝向沿 +X，渲染层只需设置 group.position.y。
 * broken 为真时轨条弯折外翻、枕木散乱、留下弹坑，表现破袭后的状态。
 */
export function CreateRailModel(fromKey, toKey, broken = 0) {
  const from = ParseHexKey(fromKey);
  const to = ParseHexKey(toKey);
  const a = HexToWorld(from.q, from.r);
  const b = HexToWorld(to.q, to.r);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const angle = Math.atan2(b.z - a.z, b.x - a.x);
  const damaged = broken ? 1 : 0;
  const geometry = CachedGeometry(`rail:${Math.round(length * 100)}:${damaged}`, (pieces) => {
    const rng = CreateRng(HashString(`rail${damaged}`));
    Box(pieces, length, 0.014, 0.17, { pos: [0, 0.007, 0], color: modelPalette.ballast, variance: 0.1 });
    const sleepers = Math.max(4, Math.round(length / 0.11));
    for (let index = 0; index < sleepers; index += 1) {
      const t = (index + 0.5) / sleepers;
      const x = (t - 0.5) * length;
      if (damaged && Math.abs(t - 0.5) < 0.16 && rng() > 0.45) {
        Box(pieces, 0.05, 0.012, 0.11, { pos: [x + (rng() - 0.5) * 0.08, 0.018, (rng() - 0.5) * 0.22], rot: [rng() * 0.5, rng() * 2, rng() * 0.4], color: modelPalette.timberDark });
      } else {
        Box(pieces, 0.045, 0.014, 0.13, { pos: [x, 0.02, 0], color: modelPalette.timberDark, variance: 0.12 });
      }
    }
    for (const side of [-0.05, 0.05]) {
      if (!damaged) {
        Box(pieces, length, 0.012, 0.014, { pos: [0, 0.032, side], color: modelPalette.rail });
        continue;
      }
      Box(pieces, length * 0.4, 0.012, 0.014, { pos: [-length * 0.3, 0.032, side], color: modelPalette.rail });
      Box(pieces, length * 0.4, 0.012, 0.014, { pos: [length * 0.3, 0.032, side], color: modelPalette.rail });
      Box(pieces, length * 0.16, 0.012, 0.014, { pos: [-length * 0.07, 0.06, side * 1.5], rot: [0.5, -0.5 * Math.sign(side), 0.7], color: modelPalette.rust });
      Box(pieces, length * 0.14, 0.012, 0.014, { pos: [length * 0.09, 0.055, side * 1.8], rot: [-0.4, 0.6 * Math.sign(side), -0.6], color: modelPalette.rust });
    }
    if (damaged) {
      Cyl(pieces, 0.09, 0.05, 0.03, 9, { pos: [0, -0.008, 0], color: "#3d342a" });
      for (let debris = 0; debris < 7; debris += 1) {
        Ball(pieces, 0.012 + rng() * 0.01, { pos: [(rng() - 0.5) * 0.4, 0.008, (rng() - 0.5) * 0.4], scale: [1, 0.6, 1], color: modelPalette.soilDark });
      }
    }
  });
  const group = MakeGroup(damaged ? "RailBroken" : "Rail", geometry);
  group.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  group.rotation.y = -angle;
  group.userData.fromKey = fromKey;
  group.userData.toKey = toKey;
  group.userData.broken = broken;
  group.userData.length = length;
  return group;
}

/**
 * 道路缎带：沿 pathKeys 生成世界空间的带状网格（Group 位于原点）。
 * options.HeightAt(key) 提供每格高度；level 1 = 土路，2 = 公路（更宽 + 中线）。
 */
export function CreateRoadRibbon(pathKeys, level = 1, options = {}) {
  const group = new THREE.Group();
  group.name = "RoadRibbon";
  group.userData.modelKind = "RoadRibbon";
  group.userData.level = level;
  if (!pathKeys || pathKeys.length < 2) return group;
  const heightAt = typeof options.HeightAt === "function" ? options.HeightAt : () => 0;
  const lift = options.lift ?? 0.012;
  const width = level >= 2 ? 0.3 : 0.17;
  const centers = pathKeys.map((key) => {
    const hex = ParseHexKey(key);
    const world = HexToWorld(hex.q, hex.r);
    return new THREE.Vector3(world.x, heightAt(key) + lift, world.z);
  });
  // 中点细分把折线抹圆，避免拐角尖锐
  const smoothed = [centers[0]];
  for (let index = 0; index < centers.length - 1; index += 1) {
    smoothed.push(centers[index].clone().lerp(centers[index + 1], 0.28), centers[index].clone().lerp(centers[index + 1], 0.72));
  }
  smoothed.push(centers[centers.length - 1]);
  const rows = smoothed.length;
  const vertexCount = (rows - 1) * 6 * (level >= 2 ? 2 : 1);
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const color = new Float32Array(vertexCount * 3);
  const baseColor = new THREE.Color(level >= 2 ? modelPalette.roadPaved : modelPalette.roadDirt).convertSRGBToLinear();
  const centerColor = new THREE.Color("#8f897d").convertSRGBToLinear();
  let cursor = 0;
  const WriteQuad = (p0, p1, p2, p3, tint) => {
    for (const corner of [p0, p1, p2, p0, p2, p3]) {
      position[cursor * 3] = corner.x; position[cursor * 3 + 1] = corner.y; position[cursor * 3 + 2] = corner.z;
      normal[cursor * 3 + 1] = 1;
      color[cursor * 3] = tint.r; color[cursor * 3 + 1] = tint.g; color[cursor * 3 + 2] = tint.b;
      cursor += 1;
    }
  };
  const sideOf = (index) => {
    const previous = smoothed[Math.max(0, index - 1)];
    const next = smoothed[Math.min(rows - 1, index + 1)];
    const dx = next.x - previous.x, dz = next.z - previous.z;
    const inverse = 1 / (Math.hypot(dx, dz) || 1);
    return new THREE.Vector3(-dz * inverse, 0, dx * inverse);
  };
  for (let index = 0; index < rows - 1; index += 1) {
    const a = smoothed[index], b = smoothed[index + 1];
    const sideA = sideOf(index).multiplyScalar(width / 2);
    const sideB = sideOf(index + 1).multiplyScalar(width / 2);
    WriteQuad(a.clone().add(sideA), b.clone().add(sideB), b.clone().sub(sideB), a.clone().sub(sideA), baseColor);
    if (level >= 2) {
      const thin = 0.16;
      WriteQuad(
        a.clone().add(sideA.clone().multiplyScalar(thin)).setY(a.y + 0.002),
        b.clone().add(sideB.clone().multiplyScalar(thin)).setY(b.y + 0.002),
        b.clone().sub(sideB.clone().multiplyScalar(thin)).setY(b.y + 0.002),
        a.clone().sub(sideA.clone().multiplyScalar(thin)).setY(a.y + 0.002),
        centerColor,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, GetModelMaterial());
  mesh.receiveShadow = true;
  mesh.name = "RoadRibbonMesh";
  group.add(mesh);
  group.userData.disposable = [geometry];
  return group;
}

// --------------------------------------------------------------------------
// 旗帜与植被
// --------------------------------------------------------------------------

/** 程序化旗面纹理（可选）：横条 + 织纹噪点，仅在浏览器环境生成。 */
function CreateClothTexture(cloth, band) {
  if (typeof document === "undefined") return null;
  const cacheKey = `cloth:${cloth}:${band}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 40;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = cloth;
  context.fillRect(0, 0, 64, 40);
  context.fillStyle = band;
  context.fillRect(0, 4, 64, 4);
  context.fillRect(0, 32, 64, 3);
  context.globalAlpha = 0.32;
  for (let index = 0; index < 48; index += 1) {
    context.fillStyle = index % 2 ? "#000000" : "#ffffff";
    context.fillRect((index * 37) % 64, (index * 23) % 40, 2, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/** 旗帜：木杆 + 分段旗面（shader 顶点动画飘动）。colors: { cloth, band, pole, height, textured }。 */
export function CreateBannerModel(colors = {}) {
  const normalized = Array.isArray(colors) ? { cloth: colors[0], band: colors[1] } : colors;
  const cloth = normalized.cloth || modelPalette.flagCloth;
  const band = normalized.band || "#d8c79c";
  const pole = normalized.pole || modelPalette.timber;
  const height = normalized.height || 0.42;
  const geometry = CachedGeometry(`banner:${cloth}:${band}:${pole}:${Math.round(height * 100)}`, (pieces) => {
    Box(pieces, 0.012, height, 0.012, { pos: [0, height / 2, 0], color: pole });
    Cone(pieces, 0.014, 0.03, 5, { pos: [0, height + 0.015, 0], color: modelPalette.steel });
    const flagWidth = height * 0.44;
    const flagHeight = height * 0.29;
    Quad(pieces, flagWidth, flagHeight, { pos: [flagWidth / 2, height * 0.82, 0], segments: 6, color: cloth, sway: { amount: 1.15, span: flagWidth, axis: "x", mode: "flag" } });
    Quad(pieces, flagWidth, flagHeight * 0.16, { pos: [flagWidth / 2, height * 0.82 + flagHeight * 0.36, 0.001], segments: 6, color: band, sway: { amount: 1.15, span: flagWidth, axis: "x", mode: "flag" } });
  });
  const group = MakeGroup("Banner", geometry, GetClothMaterial());
  group.userData.height = height;
  if (normalized.textured) {
    const texture = CreateClothTexture(cloth, band);
    if (texture) group.userData.clothTexture = texture;
  }
  return group;
}

const treeKinds = {
  Pine: { height: 0.34, kind: "pine" },
  Poplar: { height: 0.42, kind: "poplar" },
  Willow: { height: 0.32, kind: "broad" },
  Jujube: { height: 0.26, kind: "broad" },
  Scrub: { height: 0.16, kind: "dry" },
};

/** 林地植被：同种树共享一份几何体，用 InstancedMesh 一次绘制。rng 需为确定性随机源。 */
export function CreateTreeCluster(kind = "Pine", count = 6, rng = null, options = {}) {
  const definition = treeKinds[kind] || treeKinds.Pine;
  const safeRng = typeof rng === "function" ? rng : CreateRng(HashString(`trees:${kind}:${count}`));
  const geometry = CachedGeometry(`tree:${kind}`, (pieces) => SmallTree(pieces, 0, 0, definition.height, definition.kind));
  const total = Math.max(1, Math.round(count));
  const mesh = new THREE.InstancedMesh(geometry, GetModelMaterial(), total);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `TreeCluster${kind}`;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const spread = options.spread ?? 0.62;
  for (let index = 0; index < total; index += 1) {
    const angle = safeRng() * Math.PI * 2;
    const radius = spread * Math.sqrt(safeRng());
    position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.92);
    quaternion.setFromAxisAngle(axis, safeRng() * Math.PI * 2);
    const size = 0.72 + safeRng() * 0.62;
    scale.set(size, size * (0.85 + safeRng() * 0.4), size);
    mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group();
  group.name = `TreeClusterGroup${kind}`;
  group.add(mesh);
  group.userData.modelKind = "TreeCluster";
  group.userData.count = total;
  return group;
}

// --------------------------------------------------------------------------
// 统一入口与释放
// --------------------------------------------------------------------------

/** 据点模型分发：Blockhouse / Garrison / CountySeat / RailStation。 */
export function CreateStrongholdModel(strongholdType, options = {}) {
  const type = String(strongholdType || "Blockhouse");
  if (type === "CountySeat") return CreateCountySeatModel(options.scale ?? 1, options);
  if (type === "Garrison") {
    const group = CreateBlockhouseModel(options.scale ?? 1, { ...options, tier: 2 });
    group.userData.modelKind = "Garrison";
    return group;
  }
  if (type === "RailStation") {
    const geometry = CachedGeometry("railStation", (pieces) => {
      Box(pieces, 0.34, 0.16, 0.2, { pos: [0, 0.08, -0.05], color: modelPalette.loessWall });
      Wedge(pieces, 0.4, 0.07, 0.24, { pos: [0, 0.16, -0.05], color: modelPalette.tileRoof });
      Box(pieces, 0.44, 0.02, 0.1, { pos: [0, 0.01, 0.14], color: modelPalette.stone });
      for (const x of [-0.16, 0.16]) Box(pieces, 0.01, 0.12, 0.01, { pos: [x, 0.06, 0.18], color: modelPalette.timber });
      Box(pieces, 0.36, 0.012, 0.12, { pos: [0, 0.12, 0.18], color: modelPalette.mudRoof });
      Cyl(pieces, 0.016, 0.02, 0.12, 6, { pos: [0.12, 0.22, -0.05], color: "#6f675c" });
    });
    const group = MakeGroup("RailStation", geometry);
    if (options.scale) group.scale.setScalar(options.scale);
    return group;
  }
  return CreateBlockhouseModel(options.scale ?? 1, options);
}

/** 聚落模型分发：Village / Town / CountySeat。 */
export function CreateSettlementModel(featureType, scale = 1, options = {}) {
  if (featureType === "Town") return CreateTownModel(scale, options);
  if (featureType === "CountySeat") return CreateCountySeatModel(scale, options);
  return CreateVillageModel(scale, options);
}

/** 释放所有缓存的几何体、材质与纹理。渲染层销毁世界时调用。 */
export function DisposeModelCache() {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
  if (sharedMaterial) { sharedMaterial.dispose(); sharedMaterial = null; }
  if (sharedClothMaterial) { sharedClothMaterial.dispose(); sharedClothMaterial = null; }
}

/** 调试用：当前缓存规模。 */
export function GetModelCacheSize() {
  return { geometries: geometryCache.size, textures: textureCache.size };
}
