// 《滕县 一九三八》统一场景破坏层。
//
// 这套做法对应现代大场景游戏常见的“离线预破碎 + 运行时代理”，不是把整座城的
// 合批网格临时做布尔：
//   · 静态主体继续按分区／材质合批，守住 draw call；
//   · 命中只给局部材料单元记耐久；
//   · 单元失效时，按离线不规则轮廓重排 Rapier 盒，物理与可见缺口近似一致；
//   · shader 只裁离线轮廓，洞内另建有厚度、有法线、不透明的真实断面；
//   · 与轮廓严丝合缝的三十六块预烘焙碎片进入 BatchedMesh 池飞散并自动回收；
//   · 最后批量重建空间散列与导航位图，让 AI 真能从新洞口穿过去。
//
// MAX_DAMAGE_VOLUMES 是“当前镜头附近同时送进 shader 的破口”，不是整关破口上限。
// 整关历史都在 breaches；玩家走到旧破口附近时，它会重新流进 uniform。这样移动端
// 不必给每个材质背几百个 vec4，物理结果又不会因为视觉预算而回滚。

import * as THREE from "three";
import {
  DESTRUCTION_PROFILES, DestructionProfileForTag, GAMEPLAY_DESTRUCTION_ENABLED,
} from "./Data_Destruction.mjs";
import {
  FRACTURE_PATTERNS, FRACTURE_SEGMENT_COUNT, FracturePatternAt,
} from "./Data_FracturePatterns.mjs";
// 摆点层摆下去的那几件东西（弹药箱、油料桶…）**故意不进碰撞**，所以这一层的
// NearbyColliders 永远找不到它们。它们的「被炸中」走这张纯规则登记表 ——
// 由头与分工写在 Script_BlastTargets.mjs 的头注里。
import { BLAST_TARGETS } from "./Script_BlastTargets.mjs";

export const MAX_DAMAGE_VOLUMES = 24;
const MIN_FRAGMENT_HALF = 0.055;
const FRAGMENT_SLOTS_PER_TEMPLATE = 3;
const FRAGMENT_INSTANCE_CAPACITY = FRACTURE_PATTERNS.reduce(
  (sum, pattern) => sum + pattern.fragments.length * FRAGMENT_SLOTS_PER_TEMPLATE, 0);

const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function MakeDestructionUniforms(maxVolumes = MAX_DAMAGE_VOLUMES) {
  const centers = [];
  const halves = [];
  const metas = [];
  for (let i = 0; i < maxVolumes; i += 1) {
    centers.push(new THREE.Vector4(0, -10000, 0, 1));
    halves.push(new THREE.Vector4(0, 0, 0, 0));
    metas.push(new THREE.Vector4(2, 0, 0, 0));
  }
  return {
    maxVolumes,
    enabled: { value: 1 },
    count: { value: 0 },
    centers: { value: centers },      // xyz + cos(ry)
    halves: { value: halves },        // xyz + sin(ry)
    metas: { value: metas },          // axis(0=x/1=y/2=z) + patternIndex
  };
}

function ShaderPatternGlsl() {
  const radiusCases = FRACTURE_PATTERNS.map((pattern, patternIndex) => {
    const sectors = pattern.radii.map((radius, sectorIndex) =>
      `if (sector < ${Number(sectorIndex + 0.5).toFixed(1)}) return ${radius.toFixed(5)};`).join("\n    ");
    return `${patternIndex > 0 ? "else " : ""}if (pattern < ${Number(patternIndex + 0.5).toFixed(1)}) {\n    ${sectors}\n    return ${pattern.radii[0].toFixed(5)};\n  }`;
  }).join(" ");
  const offsets = FRACTURE_PATTERNS.map((pattern, patternIndex) =>
    `${patternIndex > 0 ? "else " : ""}if (pattern < ${Number(patternIndex + 0.5).toFixed(1)}) return ${pattern.angleOffset.toFixed(5)};`).join("\n  ");
  return `
float FractureSectorRadius(float pattern, float sector) {
  ${radiusCases}
  return 0.85;
}

float FractureAngleOffset(float pattern) {
  ${offsets}
  return 0.0;
}

float FractureRadius(float pattern, float angle) {
  const float turn = 6.28318530718;
  const float segmentCount = ${Number(FRACTURE_SEGMENT_COUNT).toFixed(1)};
  float sector = mod((angle - FractureAngleOffset(pattern)) / turn, 1.0);
  if (sector < 0.0) sector += 1.0;
  sector *= segmentCount;
  float base = floor(sector);
  float blend = fract(sector);
  float radiusA = FractureSectorRadius(pattern, base);
  float radiusB = FractureSectorRadius(pattern, mod(base + 1.0, segmentCount));
  return mix(radiusA, radiusB, smoothstep(0.0, 1.0, blend));
}`;
}

/** Materials 与深度材质共用的 GLSL。 */
export function DestructionShaderGlsl(maxVolumes = MAX_DAMAGE_VOLUMES) {
  return `
uniform float uDamageVolumeCount;
uniform float uDamageVolumesEnabled;
uniform vec4 uDamageVolumeCenter[${maxVolumes}];
uniform vec4 uDamageVolumeHalf[${maxVolumes}];
uniform vec4 uDamageVolumeMeta[${maxVolumes}];
${ShaderPatternGlsl()}

bool InsideDamageVolume(vec3 worldPosition, int index) {
  vec4 center = uDamageVolumeCenter[index];
  vec4 halfSize = uDamageVolumeHalf[index];
  vec4 meta = uDamageVolumeMeta[index];
  vec3 relative = worldPosition - center.xyz;
  float localX = relative.x * center.w - relative.z * halfSize.w;
  float localZ = relative.x * halfSize.w + relative.z * center.w;
  vec3 localPosition = vec3(localX, relative.y, localZ);
  vec2 planePosition;
  float depth;
  float depthHalf;
  if (meta.x < 0.5) {
    planePosition = vec2(localPosition.z / max(halfSize.z, 0.0001), localPosition.y / max(halfSize.y, 0.0001));
    depth = localPosition.x;
    depthHalf = halfSize.x;
  } else if (meta.x < 1.5) {
    planePosition = vec2(localPosition.x / max(halfSize.x, 0.0001), localPosition.z / max(halfSize.z, 0.0001));
    depth = localPosition.y;
    depthHalf = halfSize.y;
  } else {
    planePosition = vec2(localPosition.x / max(halfSize.x, 0.0001), localPosition.y / max(halfSize.y, 0.0001));
    depth = localPosition.z;
    depthHalf = halfSize.z;
  }
  if (abs(depth) > depthHalf) return false;
  float boundary = FractureRadius(meta.y, atan(planePosition.y, planePosition.x));
  return length(planePosition) <= boundary;
}

void ApplyDamageVolumes(vec3 worldPosition) {
  if (uDamageVolumesEnabled < 0.5) return;
  for (int damageIndex = 0; damageIndex < ${maxVolumes}; damageIndex += 1) {
    if (float(damageIndex) >= uDamageVolumeCount) break;
    if (InsideDamageVolume(worldPosition, damageIndex)) discard;
  }
}`;
}

export function BindDestructionUniforms(shaderUniforms, uniforms, enabled = uniforms.enabled) {
  shaderUniforms.uDamageVolumesEnabled = enabled;
  shaderUniforms.uDamageVolumeCount = uniforms.count;
  shaderUniforms.uDamageVolumeCenter = uniforms.centers;
  shaderUniforms.uDamageVolumeHalf = uniforms.halves;
  shaderUniforms.uDamageVolumeMeta = uniforms.metas;
}

function ColliderCenter(box) {
  return box.c ? box.c.slice() : [
    (box.min[0] + box.max[0]) * 0.5,
    (box.min[1] + box.max[1]) * 0.5,
    (box.min[2] + box.max[2]) * 0.5,
  ];
}

function ColliderHalf(box) {
  return box.h ? box.h.slice() : [
    (box.max[0] - box.min[0]) * 0.5,
    (box.max[1] - box.min[1]) * 0.5,
    (box.max[2] - box.min[2]) * 0.5,
  ];
}

function WorldToLocal(point, center, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const x = point.x - center[0], z = point.z - center[2];
  return { x: x * cos - z * sin, y: point.y - center[1], z: x * sin + z * cos };
}

function DirectionToLocal(direction, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return {
    x: direction.x * cos - direction.z * sin,
    y: direction.y,
    z: direction.x * sin + direction.z * cos,
  };
}

function LocalToWorld(local, center, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return {
    x: center[0] + local.x * cos + local.z * sin,
    y: center[1] + local.y,
    z: center[2] - local.x * sin + local.z * cos,
  };
}

function MakeRecord(center, half, ry, source) {
  const ax = Math.abs(Math.cos(ry)) * half[0] + Math.abs(Math.sin(ry)) * half[2];
  const az = Math.abs(Math.sin(ry)) * half[0] + Math.abs(Math.cos(ry)) * half[2];
  return {
    min: [center[0] - ax, center[1] - half[1], center[2] - az],
    max: [center[0] + ax, center[1] + half[1], center[2] + az],
    c: center,
    h: half,
    ry,
    tag: source.tag,
    destruction: source.destruction,
    destructionGeneration: (source.destructionGeneration || 0) + 1,
    destructionHealthScale: source.destructionHealthScale,
  };
}

function PushFragment(fragments, localCenter, localHalf, originalCenter, ry, source) {
  if (localHalf[0] < MIN_FRAGMENT_HALF || localHalf[1] < MIN_FRAGMENT_HALF
    || localHalf[2] < MIN_FRAGMENT_HALF) return;
  const world = LocalToWorld({ x: localCenter[0], y: localCenter[1], z: localCenter[2] }, originalCenter, ry);
  fragments.push(MakeRecord([world.x, world.y, world.z], localHalf, ry, source));
}

function PartitionAxis(fragments, axis, center, half, openingCenter, openingHalf, ry, source) {
  const axes = axis === "x" ? [2, 1, 0] : axis === "y" ? [0, 2, 1] : [0, 1, 2];
  const u = axes[0], v = axes[1];
  const minU = -half[u], maxU = half[u], minV = -half[v], maxV = half[v];
  const openMinU = Clamp(openingCenter[u] - openingHalf[u], minU, maxU);
  const openMaxU = Clamp(openingCenter[u] + openingHalf[u], minU, maxU);
  const openMinV = Clamp(openingCenter[v] - openingHalf[v], minV, maxV);
  const openMaxV = Clamp(openingCenter[v] + openingHalf[v], minV, maxV);

  const addRect = (u0, u1, v0, v1) => {
    if (u1 - u0 < MIN_FRAGMENT_HALF * 2 || v1 - v0 < MIN_FRAGMENT_HALF * 2) return;
    const localCenter = [0, 0, 0];
    const localHalf = half.slice();
    localCenter[u] = (u0 + u1) * 0.5;
    localCenter[v] = (v0 + v1) * 0.5;
    localHalf[u] = (u1 - u0) * 0.5;
    localHalf[v] = (v1 - v0) * 0.5;
    PushFragment(fragments, localCenter, localHalf, center, ry, source);
  };

  addRect(minU, openMinU, minV, maxV);
  addRect(openMaxU, maxU, minV, maxV);
  addRect(openMinU, openMaxU, minV, openMinV);
  addRect(openMinU, openMaxU, openMaxV, maxV);
}

function AddPatternPhysics(fragments, pattern, axis, center, openingCenter, openingHalf, ry, source) {
  const axes = axis === "x" ? [2, 1, 0] : axis === "y" ? [0, 2, 1] : [0, 1, 2];
  const u = axes[0], v = axes[1], depth = axes[2];
  for (const rect of pattern.physicsRects) {
    const localCenter = openingCenter.slice();
    const localHalf = openingHalf.slice();
    localCenter[u] += rect.center[0] * openingHalf[u];
    localCenter[v] += rect.center[1] * openingHalf[v];
    localHalf[u] = rect.half[0] * openingHalf[u];
    localHalf[v] = rect.half[1] * openingHalf[v];
    localHalf[depth] = openingHalf[depth];
    PushFragment(fragments, localCenter, localHalf, center, ry, source);
  }
}

function OpeningSize(profile, kind, energy, health) {
  const explosive = kind !== "bullet";
  const base = explosive ? profile.blastOpening : profile.bulletOpening;
  const ratio = explosive ? Clamp(energy / Math.max(health, 1), 0, 2.5) : 0;
  const grow = explosive ? 1 + ratio * 0.38 : 1;
  return {
    width: Math.min(profile.maxOpening[0], base[0] * grow),
    height: Math.min(profile.maxOpening[1], base[1] * grow),
  };
}

/**
 * 纯几何破口。返回的 fragments 恰好覆盖“原盒减去洞口”的四个矩形区域。
 * axis 取命中面的法向，所以墙形成横向×竖向洞，楼板形成 x×z 的坠落洞。
 */
export function FractureCollider(box, point, normal, opening, patternIndex = 0) {
  const center = ColliderCenter(box);
  const half = ColliderHalf(box);
  const ry = box.ry || 0;
  const localPoint = WorldToLocal(point, center, ry);
  const localNormal = DirectionToLocal(normal, ry);
  const abs = [Math.abs(localNormal.x), Math.abs(localNormal.y), Math.abs(localNormal.z)];
  const axis = abs[1] >= abs[0] && abs[1] >= abs[2] ? "y" : (abs[0] >= abs[2] ? "x" : "z");
  const openingCenter = [localPoint.x, localPoint.y, localPoint.z];
  const openingHalf = [0, 0, 0];

  if (axis === "y") {
    openingHalf[0] = Math.min(half[0] + 0.08, opening.width);
    openingHalf[2] = Math.min(half[2] + 0.08, opening.height);
    openingHalf[1] = half[1] + 0.09;
    openingCenter[0] = openingHalf[0] >= half[0] ? 0
      : Clamp(openingCenter[0], -half[0] + openingHalf[0], half[0] - openingHalf[0]);
    openingCenter[2] = openingHalf[2] >= half[2] ? 0
      : Clamp(openingCenter[2], -half[2] + openingHalf[2], half[2] - openingHalf[2]);
    openingCenter[1] = 0;
  } else {
    const horizontalAxis = axis === "x" ? 2 : 0;
    openingHalf[horizontalAxis] = Math.min(half[horizontalAxis] + 0.08, opening.width);
    openingHalf[1] = Math.min(half[1] + 0.08, opening.height);
    openingHalf[axis === "x" ? 0 : 2] = half[axis === "x" ? 0 : 2] + 0.09;
    openingCenter[horizontalAxis] = openingHalf[horizontalAxis] >= half[horizontalAxis] ? 0
      : Clamp(openingCenter[horizontalAxis],
        -half[horizontalAxis] + openingHalf[horizontalAxis], half[horizontalAxis] - openingHalf[horizontalAxis]);
    // 人能走过去的破口必须落到墙脚。命中点再高，也保留上沿、不在半空开一只圆窗。
    const walkableCenterY = -half[1] + openingHalf[1] - 0.025;
    openingCenter[1] = Clamp(walkableCenterY,
      -half[1] + openingHalf[1], half[1] - openingHalf[1]);
    openingCenter[axis === "x" ? 0 : 2] = 0;
  }

  const fragments = [];
  PartitionAxis(fragments, axis, center, half, openingCenter, openingHalf, ry, box);
  const pattern = FracturePatternAt(patternIndex);
  AddPatternPhysics(fragments, pattern, axis, center, openingCenter, openingHalf, ry, box);
  const worldCenter = LocalToWorld({ x: openingCenter[0], y: openingCenter[1], z: openingCenter[2] }, center, ry);
  return {
    axis,
    fragments,
    volume: {
      center: [worldCenter.x, worldCenter.y, worldCenter.z],
      half: openingHalf,
      ry,
      tag: box.tag,
      sourceHalf: half,
      patternIndex: ((patternIndex % FRACTURE_PATTERNS.length) + FRACTURE_PATTERNS.length)
        % FRACTURE_PATTERNS.length,
      patternId: pattern.id,
    },
  };
}

function PatternIndexFor(box, point) {
  const center = ColliderCenter(box);
  const values = [center[0], center[1], center[2], point.x, point.y, point.z];
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Math.round(value * 97) >>> 0;
    hash = Math.imul(hash, 16777619);
  }
  const tag = String(box.tag || "wall");
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % FRACTURE_PATTERNS.length;
}

function DistanceToAabb(point, box) {
  const dx = Math.max(box.min[0] - point.x, 0, point.x - box.max[0]);
  const dy = Math.max(box.min[1] - point.y, 0, point.y - box.max[1]);
  const dz = Math.max(box.min[2] - point.z, 0, point.z - box.max[2]);
  return Math.hypot(dx, dy, dz);
}

function SurfaceColor(surface, variation = 0, fresh = false) {
  // 所有色板都保留明确亮度下限；常驻黑占位块已经删除，这里只给真实断面与
  // 短命预碎片着色。fresh 是新鲜断裂面，必须比风化外表更亮、更偏暖。
  if (surface === "wood") {
    return new THREE.Color().setHex(fresh
      ? (variation > 0.5 ? 0xb58b5f : 0xd0a472)
      : (variation > 0.5 ? 0x806348 : 0xa27f5d));
  }
  if (surface === "dirt" || surface === "sandbag") {
    return new THREE.Color().setHex(fresh
      ? (variation > 0.5 ? 0xb79b71 : 0xd0b488)
      : (variation > 0.5 ? 0x927c5c : 0xb49a73));
  }
  return new THREE.Color().setHex(fresh
    ? (variation > 0.5 ? 0xb78d70 : 0xd2aa8a)
    : (variation > 0.5 ? 0x8f725e : 0xb08d73));
}

function AxisIndices(axis) {
  if (axis === "x") return { u: 2, v: 1, depth: 0, code: 0 };
  if (axis === "y") return { u: 0, v: 2, depth: 1, code: 1 };
  return { u: 0, v: 1, depth: 2, code: 2 };
}

function BreachLocalPoint(breach, normalizedU, normalizedV, depthValue) {
  const axes = AxisIndices(breach.axis);
  const local = [0, 0, 0];
  local[axes.u] = normalizedU * breach.half[axes.u];
  local[axes.v] = normalizedV * breach.half[axes.v];
  local[axes.depth] = depthValue;
  return local;
}

function AddBreachQuad(positions, colors, indices, breach, points, colorA, colorB) {
  const base = positions.length / 3;
  for (let index = 0; index < 4; index += 1) {
    const point = points[index];
    const world = LocalToWorld({ x: point[0], y: point[1], z: point[2] }, breach.center, breach.ry);
    positions.push(world.x, world.y, world.z);
    const color = index < 2 ? colorA : colorB;
    colors.push(color.r, color.g, color.b);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function BuildBreachGeometry(breaches) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const indices = [];
  for (const breach of breaches) {
    const pattern = FracturePatternAt(breach.patternIndex || 0);
    const axes = AxisIndices(breach.axis);
    const sourceHalf = breach.sourceHalf || breach.half;
    const frontDepth = sourceHalf[axes.depth] + 0.012;
    const backDepth = -sourceHalf[axes.depth] - 0.012;
    for (let index = 0; index < FRACTURE_SEGMENT_COUNT; index += 1) {
      const next = (index + 1) % FRACTURE_SEGMENT_COUNT;
      const angleA = pattern.angleOffset + index * Math.PI * 2 / FRACTURE_SEGMENT_COUNT;
      const angleB = pattern.angleOffset + (index + 1) * Math.PI * 2 / FRACTURE_SEGMENT_COUNT;
      const radiusA = pattern.radii[index];
      const radiusB = pattern.radii[next];
      // 外圈不是等比例圆环：每一齿略有不同，形成斜切、崩角和可读的厚度变化。
      const lipA = radiusA + 0.075 + ((index * 37 + breach.id * 11) % 5) * 0.008;
      const lipB = radiusB + 0.075 + ((next * 37 + breach.id * 11) % 5) * 0.008;
      const innerAFront = BreachLocalPoint(breach, Math.cos(angleA) * radiusA,
        Math.sin(angleA) * radiusA, frontDepth);
      const innerBFront = BreachLocalPoint(breach, Math.cos(angleB) * radiusB,
        Math.sin(angleB) * radiusB, frontDepth);
      const innerABack = BreachLocalPoint(breach, Math.cos(angleA) * radiusA,
        Math.sin(angleA) * radiusA, backDepth);
      const innerBBack = BreachLocalPoint(breach, Math.cos(angleB) * radiusB,
        Math.sin(angleB) * radiusB, backDepth);
      const outerAFront = BreachLocalPoint(breach, Math.cos(angleA) * lipA,
        Math.sin(angleA) * lipA, frontDepth + 0.018);
      const outerBFront = BreachLocalPoint(breach, Math.cos(angleB) * lipB,
        Math.sin(angleB) * lipB, frontDepth + 0.018);
      const outerABack = BreachLocalPoint(breach, Math.cos(angleA) * lipA,
        Math.sin(angleA) * lipA, backDepth - 0.018);
      const outerBBack = BreachLocalPoint(breach, Math.cos(angleB) * lipB,
        Math.sin(angleB) * lipB, backDepth - 0.018);
      const sideA = SurfaceColor(breach.surface, ((index + breach.id) % 3) / 2, true);
      const sideB = SurfaceColor(breach.surface, ((next + breach.id) % 3) / 2, true);
      const weatheredA = SurfaceColor(breach.surface, ((index + 1) % 4) / 3, false);
      const weatheredB = SurfaceColor(breach.surface, ((next + 1) % 4) / 3, false);
      // 洞内侧壁：真正跨越构件前后表面，因此从任何角度看都不再是透明薄片。
      AddBreachQuad(positions, colors, indices, breach,
        [innerAFront, innerBFront, innerBBack, innerABack], sideA, sideB);
      // 前后两面斜切断唇，覆盖裁洞边缘并把旧表面过渡到新鲜断面。
      AddBreachQuad(positions, colors, indices, breach,
        [outerAFront, outerBFront, innerBFront, innerAFront], weatheredA, sideB);
      AddBreachQuad(positions, colors, indices, breach,
        [outerBBack, outerABack, innerABack, innerBBack], weatheredB, sideA);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  if (positions.length) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  geometry.userData.breachCount = breaches.length;
  geometry.userData.hasThickness = breaches.length > 0;
  geometry.userData.generatedFromPrefracture = true;
  return geometry;
}

function MakeShardGeometry(fragment) {
  const shape = new THREE.Shape();
  const first = fragment.points[0];
  shape.moveTo(first[0], first[1]);
  for (let index = 1; index < fragment.points.length; index += 1) {
    shape.lineTo(fragment.points[index][0], fragment.points[index][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.025,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  geometry.userData.prefractured = true;
  geometry.userData.ring = fragment.ring;
  geometry.userData.sector = fragment.sector;
  return geometry;
}

function BaseShardQuaternion(axis, ry) {
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
  const axisRotation = new THREE.Quaternion();
  if (axis === "x") axisRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  else if (axis === "y") axisRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  return yaw.multiply(axisRotation);
}

export class DestructionSystem {
  constructor(scene, library, uniforms, { vfx = null, audio = null } = {}) {
    this.scene = scene;
    this.library = library;
    this.uniforms = uniforms;
    this.vfx = vfx;
    this.audio = audio;
    this.battlefield = null;
    this.physics = null;
    this.nav = null;
    this.damage = new Map();
    this.breaches = [];
    this.nextBreachId = 1;
    this.topologyRebuilds = 0;
    this.damagedCount = 0;
    this.protectedHits = 0;
    this.disabledHits = 0;
    this.gameplayEnabled = GAMEPLAY_DESTRUCTION_ENABLED;
    this.previewMode = false;
    this.lastFocus = new THREE.Vector3(1e9, 1e9, 1e9);
    this.uniformDirty = true;

    const fragmentMaterial = library?.Plain
      ? library.Plain("DestructionFlyingFragments", {
        color: 0xffffff, roughness: 0.98, metalness: 0, flatShading: true,
        emissive: 0x8c6447, emissiveIntensity: 0.62,
      })
      : new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.98, metalness: 0, flatShading: true,
        emissive: 0x8c6447, emissiveIntensity: 0.62,
      });
    this.fragmentMaterialOwned = !library?.Plain;
    fragmentMaterial.vertexColors = true;
    fragmentMaterial.needsUpdate = true;
    this.fragments = new THREE.BatchedMesh(
      FRAGMENT_INSTANCE_CAPACITY, 65536, 131072, fragmentMaterial);
    this.fragments.name = "Destruction_FlyingPrefracturedFragments";
    this.fragments.castShadow = true;
    this.fragments.receiveShadow = true;
    this.fragments.frustumCulled = false;
    this.fragments.userData.prefracturedTemplateCount = FRACTURE_PATTERNS.reduce(
      (sum, pattern) => sum + pattern.fragments.length, 0);
    this.fragments.userData.shortLived = true;
    this.fragmentSlots = [];
    this.fragmentSlotCursors = [];
    for (let patternIndex = 0; patternIndex < FRACTURE_PATTERNS.length; patternIndex += 1) {
      const pattern = FRACTURE_PATTERNS[patternIndex];
      this.fragmentSlots[patternIndex] = [];
      this.fragmentSlotCursors[patternIndex] = [];
      for (let fragmentIndex = 0; fragmentIndex < pattern.fragments.length; fragmentIndex += 1) {
        const sourceGeometry = MakeShardGeometry(pattern.fragments[fragmentIndex]);
        const geometryId = this.fragments.addGeometry(sourceGeometry);
        sourceGeometry.dispose();
        const slots = [];
        for (let slot = 0; slot < FRAGMENT_SLOTS_PER_TEMPLATE; slot += 1) {
          const instanceId = this.fragments.addInstance(geometryId);
          this.fragments.setVisibleAt(instanceId, false);
          slots.push(instanceId);
        }
        this.fragmentSlots[patternIndex][fragmentIndex] = slots;
        this.fragmentSlotCursors[patternIndex][fragmentIndex] = 0;
      }
    }
    this.fragmentStates = [];
    this.fragmentStateByInstance = new Map();
    scene.add(this.fragments);

    const breachMaterial = library?.Plain
      ? library.Plain("DestructionFreshBreach", {
        color: 0xffffff, roughness: 1, metalness: 0, flatShading: true,
        side: THREE.DoubleSide, emissive: 0x704a31, emissiveIntensity: 0.48,
      })
      : new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 1, metalness: 0, flatShading: true,
        side: THREE.DoubleSide, emissive: 0x704a31, emissiveIntensity: 0.48,
      });
    this.breachMaterialOwned = !library?.Plain;
    breachMaterial.vertexColors = true;
    breachMaterial.transparent = false;
    breachMaterial.depthWrite = true;
    breachMaterial.needsUpdate = true;
    this.breachMesh = new THREE.Mesh(BuildBreachGeometry([]), breachMaterial);
    this.breachMesh.name = "Destruction_OpaqueBreachLining";
    this.breachMesh.castShadow = true;
    this.breachMesh.receiveShadow = true;
    this.breachMesh.frustumCulled = false;
    this.breachMesh.userData.opaqueFractureSurface = true;
    this.breachMesh.userData.usesDestructionShader = false;
    scene.add(this.breachMesh);

    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.euler = new THREE.Euler();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempVector = new THREE.Vector3();
  }

  SetWorld(battlefield, physics, nav = null) {
    this.battlefield = battlefield;
    this.physics = physics;
    this.nav = nav;
  }

  SetPreviewMode(enabled) {
    this.previewMode = !!enabled;
    return this.previewMode;
  }

  get Enabled() { return this.gameplayEnabled || this.previewMode; }

  Clear() {
    this.damage.clear();
    this.breaches.length = 0;
    this.nextBreachId = 1;
    this.damagedCount = 0;
    this.protectedHits = 0;
    this.disabledHits = 0;
    this.topologyRebuilds = 0;
    this._ClearFragments();
    this._RebuildBreachMesh();
    this.uniforms.count.value = 0;
    this.uniformDirty = true;
    this.lastFocus.set(1e9, 1e9, 1e9);
  }

  /**
   * 给破坏预览编辑器留一张可逆快照。
   *
   * 不能只记 breaches：开洞会同时替换三份碰撞数组、摘 Rapier 盒、删掩体点并
   * 重烘导航。编辑器退出时若只把 shader 数量清零，画面看似复原，玩家却仍会穿墙。
   * 这张快照因此把“画面 + 拓扑 + 耐久”三层一起记住；对象本身不深拷贝，保留
   * 与 PhysicsWorld.recordByHandle 相同的身份。
   */
  CaptureSnapshot() {
    const field = this.battlefield;
    if (!field || !this.physics) return null;
    const CopyList = (list) => (Array.isArray(list) ? list.slice() : null);
    const damage = [];
    for (const [box, state] of this.damage) {
      damage.push([box, {
        profile: state.profile, health: state.health, damage: state.damage, stage: state.stage,
      }]);
    }
    return {
      battlefield: field,
      physics: this.physics,
      nav: this.nav,
      colliders: CopyList(field.colliders),
      cityColliders: field.city ? CopyList(field.city.colliders) : null,
      outfieldColliders: field.outfield ? CopyList(field.outfield.colliders) : null,
      covers: CopyList(field.covers),
      damage,
      breaches: this.breaches.map((breach) => ({
        ...breach, center: breach.center.slice(), half: breach.half.slice(),
        sourceHalf: breach.sourceHalf ? breach.sourceHalf.slice() : null,
        eject: breach.eject ? breach.eject.slice() : null,
      })),
      nextBreachId: this.nextBreachId,
      damagedCount: this.damagedCount,
      protectedHits: this.protectedHits,
      topologyRebuilds: this.topologyRebuilds,
      disabledHits: this.disabledHits,
      fragmentSlotCursors: this.fragmentSlotCursors.map((row) => row.slice()),
      fragmentStates: this.fragmentStates.map((state) => ({
        instanceId: state.instanceId,
        patternIndex: state.patternIndex,
        fragmentIndex: state.fragmentIndex,
        position: state.position.toArray(),
        velocity: state.velocity.toArray(),
        quaternion: state.quaternion.toArray(),
        angularAxis: state.angularAxis.toArray(),
        angularSpeed: state.angularSpeed,
        scale: state.scale.toArray(),
        age: state.age,
        life: state.life,
        floorY: state.floorY,
        bounced: state.bounced,
        color: state.color,
      })),
      navRevisions: this.nav && Number.isFinite(this.nav.revisions) ? this.nav.revisions : null,
    };
  }

  /**
   * 把 CaptureSnapshot() 之后的所有试拆复原。只接受同一关、同一 PhysicsWorld：
   * 换关会销毁旧世界，那时旧快照自然作废，绝不能拿旧 handle 去碰新关。
   */
  RestoreSnapshot(snapshot) {
    if (!snapshot || snapshot.battlefield !== this.battlefield
      || snapshot.physics !== this.physics || !this.battlefield || !this.physics) return false;
    const field = this.battlefield;
    const physics = this.physics;
    const active = new Set();
    const AddActive = (list) => {
      if (!Array.isArray(list)) return;
      for (const box of list) if (box) active.add(box);
    };
    AddActive(field.colliders);
    if (field.city) AddActive(field.city.colliders);
    if (field.outfield) AddActive(field.outfield.colliders);
    // 当前仍活着的碎片全部摘掉；更早一代碎片在继续开洞时已经由 _Commit 摘过。
    for (const box of active) {
      if (box._physicsHandle !== null && box._physicsHandle !== undefined) {
        physics.RemoveSolid(box._physicsHandle);
      }
    }

    const RestoreList = (list, saved) => {
      if (!Array.isArray(list) || !Array.isArray(saved)) return;
      list.length = 0;
      list.push(...saved);
    };
    RestoreList(field.colliders, snapshot.colliders);
    if (field.city) RestoreList(field.city.colliders, snapshot.cityColliders);
    if (field.outfield) RestoreList(field.outfield.colliders, snapshot.outfieldColliders);
    RestoreList(field.covers, snapshot.covers);

    // 一只盒可能同时在 field 与 city/outfield 快照里；Rapier 只加一次。
    const restored = new Set();
    const RestorePhysics = (list) => {
      if (!Array.isArray(list)) return;
      for (const box of list) {
        if (!box || restored.has(box)) continue;
        restored.add(box);
        box.destroyed = false;
        box._physicsHandle = physics.AddSolid(box);
      }
    };
    RestorePhysics(snapshot.colliders);
    RestorePhysics(snapshot.cityColliders);
    RestorePhysics(snapshot.outfieldColliders);
    if (typeof physics.RefreshStaticQueries === "function") physics.RefreshStaticQueries();

    // 子层与合并层都重刷：SceneEditor 之后若 RefreshColliders，不能从一张旧 city.grid
    // 把已经复原的墙再次弄成“画面在、射线不认”。
    const RebuildGrid = (owner) => {
      if (!owner || typeof owner.BuildCollisionGrid !== "function") return;
      const grid = owner.BuildCollisionGrid();
      if (grid) owner.grid = grid;
    };
    RebuildGrid(field.city);
    RebuildGrid(field.outfield);
    RebuildGrid(field);

    this.damage.clear();
    for (const [box, state] of snapshot.damage) this.damage.set(box, { ...state });
    this.breaches.length = 0;
    for (const breach of snapshot.breaches) {
      this.breaches.push({
        ...breach, center: breach.center.slice(), half: breach.half.slice(),
        sourceHalf: breach.sourceHalf ? breach.sourceHalf.slice() : null,
        eject: breach.eject ? breach.eject.slice() : null,
      });
    }
    this.nextBreachId = snapshot.nextBreachId;
    this.damagedCount = snapshot.damagedCount;
    this.protectedHits = snapshot.protectedHits;
    this.disabledHits = snapshot.disabledHits || 0;
    this.topologyRebuilds = snapshot.topologyRebuilds;
    if (snapshot.fragmentSlotCursors) {
      this.fragmentSlotCursors = snapshot.fragmentSlotCursors.map((row) => row.slice());
    }
    this._RebuildBreachMesh();
    this._RestoreFragmentStates(snapshot.fragmentStates || []);
    if (this.nav && typeof this.nav.Refresh === "function") {
      this.nav.Refresh(field);
      if (snapshot.navRevisions !== null) this.nav.revisions = snapshot.navRevisions;
    }
    this.uniforms.count.value = 0;
    this.uniformDirty = true;
    this.lastFocus.set(1e9, 1e9, 1e9);
    return true;
  }

  Profile(box) {
    const id = box && box.destruction && box.destruction.profile;
    return (id && DESTRUCTION_PROFILES[id]) || DestructionProfileForTag(box ? box.tag : "wall");
  }

  StateFor(box) {
    let state = this.damage.get(box);
    if (state) return state;
    const profile = this.Profile(box);
    const scale = box.destructionHealthScale || Math.pow(profile.fragmentHealthScale || 1,
      box.destructionGeneration || 0);
    state = { profile, health: profile.health * Math.max(0.42, scale), damage: 0, stage: 0 };
    this.damage.set(box, state);
    return state;
  }

  Hit(box, point, energy, { kind = "bullet", normal = null, deferTopology = false } = {}) {
    if (!box || box.destroyed || !(energy > 0)) return { damaged: false, broken: false };
    if (!this.Enabled) {
      this.disabledHits += 1;
      return { damaged: false, broken: false, disabled: true };
    }
    const state = this.StateFor(box);
    if (!state.profile.destructible) {
      this.protectedHits += 1;
      return { damaged: false, broken: false, protected: true, profile: state.profile.id };
    }
    const scale = kind === "bullet" ? state.profile.bulletScale : state.profile.blastScale;
    const applied = energy * scale;
    if (!(applied > 0)) return { damaged: false, broken: false, profile: state.profile.id };
    state.damage += applied;
    this.damagedCount += 1;
    const ratio = state.damage / state.health;
    const stage = ratio >= 0.72 ? 2 : ratio >= 0.34 ? 1 : 0;
    if (stage > state.stage) {
      state.stage = stage;
      this._DamagePulse(point, normal, state.profile.surface, 1 + stage * 0.35);
    }
    if (ratio < 1) {
      return { damaged: true, broken: false, ratio, stage, profile: state.profile.id };
    }

    const c = ColliderCenter(box);
    const n = normal || { x: point.x - c[0], y: point.y - c[1], z: point.z - c[2] };
    const length = Math.hypot(n.x, n.y, n.z) || 1;
    const unit = { x: n.x / length, y: n.y / length, z: n.z / length };
    const opening = OpeningSize(state.profile, kind, energy, state.health);
    const patternIndex = PatternIndexFor(box, point);
    const fracture = FractureCollider(box, point, unit, opening, patternIndex);
    const broken = { box, state, fracture, point: { x: point.x, y: point.y, z: point.z }, normal: unit };
    if (!deferTopology) this._Commit([broken]);
    return { damaged: true, broken: true, ratio, stage: 3, profile: state.profile.id, pending: broken };
  }

  Blast(position, radius, energy, { kind = "grenade" } = {}) {
    // 摆点层的物件先算 —— **两道闸都要绕开**：
    //   · `!this.battlefield`：出图/编辑器里场景还没接上，但摆件已经在场上了；
    //   · `!this.Enabled`：GAMEPLAY_DESTRUCTION_ENABLED 是**几何破坏**的总闸，
    //     关掉它不该顺手把「弹药箱打得中吗」一起关掉（那是玩法，不是画面预算）。
    // 表是空的时候这一行就是一次 Map.size 检查，不值得为它加条件。
    const targets = BLAST_TARGETS.Blast(position, radius, energy, kind);
    if (!this.battlefield || !(radius > 0) || !(energy > 0)) {
      return { hits: 0, broken: 0, targets: targets.hit };
    }
    if (!this.Enabled) {
      this.disabledHits += 1;
      return { hits: 0, broken: 0, disabled: true, targets: targets.hit };
    }
    const candidates = this.battlefield.NearbyColliders(position.x, position.z, radius + 2.5);
    const broken = [];
    let hits = 0;
    for (const box of candidates) {
      if (!box || box.destroyed) continue;
      const distance = DistanceToAabb(position, box);
      if (distance > radius * 1.25) continue;
      const falloff = Clamp(1 - distance / (radius * 1.25), 0, 1);
      if (falloff <= 0) continue;
      const center = ColliderCenter(box);
      const normal = { x: position.x - center[0], y: position.y - center[1], z: position.z - center[2] };
      const point = {
        x: Clamp(position.x, box.min[0], box.max[0]),
        y: Clamp(position.y, box.min[1], box.max[1]),
        z: Clamp(position.z, box.min[2], box.max[2]),
      };
      const result = this.Hit(box, point, energy * falloff * falloff,
        { kind, normal, deferTopology: true });
      if (result.damaged || result.protected) hits += 1;
      if (result.broken) broken.push(result.pending);
    }
    if (broken.length) this._Commit(broken);
    return { hits, broken: broken.length, targets: targets.hit };
  }

  _Commit(brokenList) {
    if (!this.battlefield || !this.physics || brokenList.length === 0) return;
    const replacements = new Map();
    for (const broken of brokenList) {
      const { box, fracture, state } = broken;
      if (box.destroyed || replacements.has(box)) continue;
      box.destroyed = true;
      this.damage.delete(box);
      this.physics.RemoveSolid(box._physicsHandle);
      for (const fragment of fracture.fragments) {
        fragment.destructionHealthScale = state.profile.fragmentHealthScale;
        fragment._physicsHandle = this.physics.AddSolid(fragment);
      }
      replacements.set(box, fracture.fragments);
      const breach = {
        id: this.nextBreachId++, ...fracture.volume, axis: fracture.axis,
        surface: state.profile.surface,
        eject: [broken.normal.x, broken.normal.y, broken.normal.z],
      };
      this.breaches.push(breach);
      this._SpawnFragments(breach);
      this._DamagePulse(broken.point, broken.normal, state.profile.surface, 2.4);
      if (this.audio) {
        const cue = state.profile.surface === "wood" ? "impactWood"
          : (state.profile.surface === "dirt" || state.profile.surface === "sandbag") ? "impactDirt" : "impactBrick";
        this.audio.Play(cue, { position: new THREE.Vector3(broken.point.x, broken.point.y, broken.point.z), volume: 0.9 });
      }
    }
    if (!replacements.size) return;

    const replaceList = (list) => {
      if (!Array.isArray(list)) return;
      const next = [];
      for (const box of list) {
        const fragments = replacements.get(box);
        if (fragments) next.push(...fragments); else next.push(box);
      }
      list.length = 0;
      list.push(...next);
    };
    // Field.colliders 是 city/outfield 的快照；三份都改，编辑器随后 Refresh 也不会把墙复活。
    replaceList(this.battlefield.colliders);
    if (this.battlefield.city) replaceList(this.battlefield.city.colliders);
    if (this.battlefield.outfield) replaceList(this.battlefield.outfield.colliders);
    // 炮坑的「地基保护」掩码是按碰撞盒表记忆的；墙塌了，它脚下的土才准挖。
    this.battlefield.deformation?.InvalidateDeformMask?.();

    if (typeof this.battlefield.BuildCollisionGrid === "function") {
      const grid = this.battlefield.BuildCollisionGrid();
      if (grid) this.battlefield.grid = grid;
    }
    // 旧掩体点若还贴在洞口上，AI 会蹲在已经不存在的墙后面。
    this.battlefield.covers = (this.battlefield.covers || []).filter((cover) => {
      for (const broken of brokenList) {
        const v = broken.fracture.volume;
        if (Math.hypot(cover.x - v.center[0], cover.z - v.center[2]) < Math.max(v.half[0], v.half[2]) + 0.8) return false;
      }
      return true;
    });
    if (this.nav && typeof this.nav.Refresh === "function") this.nav.Refresh(this.battlefield);
    this.topologyRebuilds += 1;
    this._RebuildBreachMesh();
    this.uniformDirty = true;
  }

  _DamagePulse(point, normal, surface, scale) {
    if (!this.vfx || !point) return;
    const n = normal || { x: 0, y: 1, z: 0 };
    const unit = new THREE.Vector3(n.x, n.y, n.z).normalize();
    const base = new THREE.Vector3(point.x, point.y, point.z);
    const tangent = new THREE.Vector3(-unit.z, 0, unit.x);
    if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0); else tangent.normalize();
    const count = scale > 2 ? 3 : 1;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) * 0.5) * 0.34 * scale;
      this.vfx.Impact(base.clone().addScaledVector(tangent, offset), unit,
        surface === "sandbag" ? "sandbag" : surface);
    }
  }

  _RebuildBreachMesh() {
    const previous = this.breachMesh.geometry;
    this.breachMesh.geometry = BuildBreachGeometry(this.breaches);
    if (previous) previous.dispose();
  }

  _ClearFragments() {
    for (const state of this.fragmentStates) this.fragments.setVisibleAt(state.instanceId, false);
    this.fragmentStates.length = 0;
    this.fragmentStateByInstance.clear();
  }

  _SetFragmentMatrix(state) {
    this.matrix.compose(state.position, state.quaternion, state.scale);
    this.fragments.setMatrixAt(state.instanceId, this.matrix);
  }

  _TakeFragmentSlot(patternIndex, fragmentIndex) {
    const slots = this.fragmentSlots[patternIndex][fragmentIndex];
    const cursor = this.fragmentSlotCursors[patternIndex][fragmentIndex] % slots.length;
    this.fragmentSlotCursors[patternIndex][fragmentIndex] = cursor + 1;
    const instanceId = slots[cursor];
    const previous = this.fragmentStateByInstance.get(instanceId);
    if (previous) {
      const index = this.fragmentStates.indexOf(previous);
      if (index >= 0) this.fragmentStates.splice(index, 1);
      this.fragmentStateByInstance.delete(instanceId);
      this.fragments.setVisibleAt(instanceId, false);
    }
    return instanceId;
  }

  _SpawnFragments(breach) {
    const patternIndex = breach.patternIndex || 0;
    const pattern = FracturePatternAt(patternIndex);
    const axes = AxisIndices(breach.axis);
    const sourceHalf = breach.sourceHalf || breach.half;
    const seed = breach.id * 2654435761;
    const random = (index) => {
      const value = Math.sin(seed + index * 91.137) * 43758.5453;
      return value - Math.floor(value);
    };
    const eject = new THREE.Vector3(...(breach.eject || [0, 1, 0]));
    if (eject.lengthSq() < 0.001) eject.set(0, 1, 0); else eject.normalize();
    const baseQuaternion = BaseShardQuaternion(breach.axis, breach.ry);
    for (let fragmentIndex = 0; fragmentIndex < pattern.fragments.length; fragmentIndex += 1) {
      const fragment = pattern.fragments[fragmentIndex];
      const instanceId = this._TakeFragmentSlot(patternIndex, fragmentIndex);
      const local = [0, 0, 0];
      local[axes.u] = fragment.anchor[0] * breach.half[axes.u];
      local[axes.v] = fragment.anchor[1] * breach.half[axes.v];
      const world = LocalToWorld({ x: local[0], y: local[1], z: local[2] }, breach.center, breach.ry);
      const position = new THREE.Vector3(world.x, world.y, world.z).addScaledVector(eject, 0.045);
      const radial = position.clone().sub(new THREE.Vector3(...breach.center));
      if (radial.lengthSq() < 0.001) radial.set(random(fragmentIndex) - 0.5, 0.2, random(fragmentIndex + 1) - 0.5);
      radial.normalize();
      const speed = 2.6 + random(fragmentIndex + 17) * 3.6;
      const velocity = eject.clone().multiplyScalar(speed)
        .addScaledVector(radial, 0.8 + random(fragmentIndex + 19) * 2.1);
      velocity.y += 1.4 + random(fragmentIndex + 23) * 2.8;
      const jitter = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        (random(fragmentIndex + 31) - 0.5) * 0.22,
        (random(fragmentIndex + 37) - 0.5) * 0.22,
        (random(fragmentIndex + 41) - 0.5) * 0.22));
      const quaternion = baseQuaternion.clone().multiply(jitter);
      const angularAxis = new THREE.Vector3(
        random(fragmentIndex + 43) - 0.5,
        random(fragmentIndex + 47) - 0.5,
        random(fragmentIndex + 53) - 0.5).normalize();
      const scale = new THREE.Vector3(
        breach.half[axes.u], breach.half[axes.v], Math.max(0.10, sourceHalf[axes.depth] * 2));
      const color = SurfaceColor(breach.surface, random(fragmentIndex + 59), fragment.ring === "core");
      const state = {
        instanceId, patternIndex, fragmentIndex, position, velocity, quaternion, angularAxis,
        angularSpeed: 2.8 + random(fragmentIndex + 61) * 7.2,
        scale,
        age: 0,
        life: 3.4 + random(fragmentIndex + 67) * 1.8,
        floorY: breach.axis === "y"
          ? breach.center[1] - 4.5
          : breach.center[1] - breach.half[1] + Math.max(0.035, scale.y * 0.08),
        bounced: false,
        color: color.getHex(),
      };
      this.fragmentStates.push(state);
      this.fragmentStateByInstance.set(instanceId, state);
      this.fragments.setColorAt(instanceId, color);
      this.fragments.setVisibleAt(instanceId, true);
      this._SetFragmentMatrix(state);
    }
  }

  _UpdateFragments(dt) {
    const step = Clamp(Number(dt) || 0, 0, 0.05);
    if (!(step > 0)) return;
    for (let index = this.fragmentStates.length - 1; index >= 0; index -= 1) {
      const state = this.fragmentStates[index];
      state.age += step;
      if (state.age >= state.life) {
        this.fragments.setVisibleAt(state.instanceId, false);
        this.fragmentStateByInstance.delete(state.instanceId);
        this.fragmentStates.splice(index, 1);
        continue;
      }
      state.velocity.y -= 9.81 * step;
      state.position.addScaledVector(state.velocity, step);
      if (state.position.y < state.floorY) {
        state.position.y = state.floorY;
        if (!state.bounced && Math.abs(state.velocity.y) > 1.1) {
          state.velocity.y *= -0.24;
          state.velocity.x *= 0.68;
          state.velocity.z *= 0.68;
          state.bounced = true;
        } else {
          state.velocity.set(0, 0, 0);
          state.angularSpeed *= 0.80;
        }
      }
      this.tempQuaternion.setFromAxisAngle(state.angularAxis, state.angularSpeed * step);
      state.quaternion.multiply(this.tempQuaternion).normalize();
      this._SetFragmentMatrix(state);
    }
  }

  _RestoreFragmentStates(savedStates) {
    this._ClearFragments();
    for (const saved of savedStates) {
      const state = {
        ...saved,
        position: new THREE.Vector3().fromArray(saved.position),
        velocity: new THREE.Vector3().fromArray(saved.velocity),
        quaternion: new THREE.Quaternion().fromArray(saved.quaternion),
        angularAxis: new THREE.Vector3().fromArray(saved.angularAxis),
        scale: new THREE.Vector3().fromArray(saved.scale),
      };
      this.fragmentStates.push(state);
      this.fragmentStateByInstance.set(state.instanceId, state);
      this.fragments.setColorAt(state.instanceId, new THREE.Color(state.color));
      this.fragments.setVisibleAt(state.instanceId, true);
      this._SetFragmentMatrix(state);
    }
  }

  Update(focus, dt = 0) {
    this._UpdateFragments(dt);
    if (!focus || this.breaches.length === 0) {
      if (this.uniforms.count.value !== 0) this.uniforms.count.value = 0;
      return;
    }
    const moved = this.lastFocus.distanceToSquared(focus) > 16;
    if (!this.uniformDirty && !moved) return;
    this.lastFocus.copy(focus);
    const selected = this.breaches.slice()
      .sort((a, b) => {
        const da = (a.center[0] - focus.x) ** 2 + (a.center[1] - focus.y) ** 2 + (a.center[2] - focus.z) ** 2;
        const db = (b.center[0] - focus.x) ** 2 + (b.center[1] - focus.y) ** 2 + (b.center[2] - focus.z) ** 2;
        return da - db || b.id - a.id;
      })
      .slice(0, this.uniforms.maxVolumes);
    this.uniforms.count.value = selected.length;
    for (let i = 0; i < selected.length; i += 1) {
      const breach = selected[i];
      this.uniforms.centers.value[i].set(
        breach.center[0], breach.center[1], breach.center[2], Math.cos(breach.ry));
      this.uniforms.halves.value[i].set(
        breach.half[0], breach.half[1], breach.half[2], Math.sin(breach.ry));
      const axes = AxisIndices(breach.axis);
      this.uniforms.metas.value[i].set(axes.code, breach.patternIndex || 0, 0, 0);
    }
    this.uniformDirty = false;
  }

  Stats() {
    if (!this.battlefield) return null;
    let destructible = 0, structural = 0, damaged = 0;
    for (const box of this.battlefield.colliders) {
      const profile = this.Profile(box);
      if (profile.destructible) destructible += 1; else structural += 1;
      if (this.damage.has(box) && this.damage.get(box).damage > 0) damaged += 1;
    }
    return {
      destructible,
      structural,
      damaged,
      breaches: this.breaches.length,
      activeVolumes: this.uniforms.count.value,
      breachLinings: this.breachMesh.geometry.userData.breachCount || 0,
      flyingFragments: this.fragmentStates.length,
      prefractured: true,
      gameplayEnabled: this.gameplayEnabled,
      previewMode: this.previewMode,
      topologyRebuilds: this.topologyRebuilds,
      protectedHits: this.protectedHits,
      disabledHits: this.disabledHits,
    };
  }

  Dispose() {
    this.Clear();
    this.scene.remove(this.fragments);
    this.scene.remove(this.breachMesh);
    if (typeof this.fragments.dispose === "function") this.fragments.dispose();
    else if (this.fragments.geometry) this.fragments.geometry.dispose();
    this.breachMesh.geometry.dispose();
    // MaterialLibrary 管理并复用自己的材质；只有 fallback 裸材质由本系统释放。
    if (this.fragmentMaterialOwned) this.fragments.material.dispose();
    if (this.breachMaterialOwned) this.breachMesh.material.dispose();
  }
}
