// 《滕县 一九三八》统一场景破坏层。
//
// 这套做法对应现代大场景游戏常见的“代理破坏”，不是把整座城的合批网格拆散：
//   · 静态主体继续按分区／材质合批，守住 draw call；
//   · 命中只给局部材料单元记耐久；
//   · 单元失效时，把一个 Rapier 盒分成洞口四周最多四块残余碰撞；
//   · 同一只世界空间 OBB 交给 shader 裁掉视觉几何，物理洞与画面洞完全重合；
//   · 断口边缘用一只 InstancedMesh 留下常驻断砖，短命粉尘仍复用 Script_Vfx；
//   · 最后批量重建空间散列与导航位图，让 AI 真能从新洞口穿过去。
//
// MAX_DAMAGE_VOLUMES 是“当前镜头附近同时送进 shader 的破口”，不是整关破口上限。
// 整关历史都在 breaches；玩家走到旧破口附近时，它会重新流进 uniform。这样移动端
// 不必给每个材质背几百个 vec4，物理结果又不会因为视觉预算而回滚。

import * as THREE from "three";
import { DESTRUCTION_PROFILES, DestructionProfileForTag } from "./Data_Destruction.mjs";

export const MAX_DAMAGE_VOLUMES = 24;
const MIN_FRAGMENT_HALF = 0.055;
const RUBBLE_CAPACITY = 768;

const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function MakeDestructionUniforms(maxVolumes = MAX_DAMAGE_VOLUMES) {
  const centers = [];
  const halves = [];
  for (let i = 0; i < maxVolumes; i += 1) {
    centers.push(new THREE.Vector4(0, -10000, 0, 1));
    halves.push(new THREE.Vector4(0, 0, 0, 0));
  }
  return {
    maxVolumes,
    enabled: { value: 1 },
    count: { value: 0 },
    centers: { value: centers },      // xyz + cos(ry)
    halves: { value: halves },        // xyz + sin(ry)
  };
}

/** Materials 与深度材质共用的 GLSL。 */
export function DestructionShaderGlsl(maxVolumes = MAX_DAMAGE_VOLUMES) {
  return `
uniform float uDamageVolumeCount;
uniform float uDamageVolumesEnabled;
uniform vec4 uDamageVolumeCenter[${maxVolumes}];
uniform vec4 uDamageVolumeHalf[${maxVolumes}];

bool InsideDamageVolume(vec3 worldPosition, int index) {
  vec4 center = uDamageVolumeCenter[index];
  vec4 halfSize = uDamageVolumeHalf[index];
  vec3 relative = worldPosition - center.xyz;
  float localX = relative.x * center.w - relative.z * halfSize.w;
  float localZ = relative.x * halfSize.w + relative.z * center.w;
  vec3 localPosition = vec3(localX, relative.y, localZ);
  return all(lessThanEqual(abs(localPosition), halfSize.xyz));
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
export function FractureCollider(box, point, normal, opening) {
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
    },
  };
}

function DistanceToAabb(point, box) {
  const dx = Math.max(box.min[0] - point.x, 0, point.x - box.max[0]);
  const dy = Math.max(box.min[1] - point.y, 0, point.y - box.max[1]);
  const dz = Math.max(box.min[2] - point.z, 0, point.z - box.max[2]);
  return Math.hypot(dx, dy, dz);
}

function SurfaceColor(surface, variation = 0) {
  if (surface === "wood") return new THREE.Color().setHex(variation > 0.55 ? 0x5a4634 : 0x7a6247);
  if (surface === "dirt" || surface === "sandbag") return new THREE.Color().setHex(variation > 0.55 ? 0x76664e : 0x9a8461);
  return new THREE.Color().setHex(variation > 0.55 ? 0x574f49 : 0x82766c);
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
    this.lastFocus = new THREE.Vector3(1e9, 1e9, 1e9);
    this.uniformDirty = true;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.98, metalness: 0, vertexColors: true,
    });
    this.rubble = new THREE.InstancedMesh(geometry, material, RUBBLE_CAPACITY);
    this.rubble.name = "Destruction_Rubble";
    this.rubble.castShadow = true;
    this.rubble.receiveShadow = true;
    this.rubble.frustumCulled = false;
    this.rubble.count = 0;
    this.rubbleCursor = 0;
    scene.add(this.rubble);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.euler = new THREE.Euler();
  }

  SetWorld(battlefield, physics, nav = null) {
    this.battlefield = battlefield;
    this.physics = physics;
    this.nav = nav;
  }

  Clear() {
    this.damage.clear();
    this.breaches.length = 0;
    this.nextBreachId = 1;
    this.damagedCount = 0;
    this.protectedHits = 0;
    this.topologyRebuilds = 0;
    this.rubble.count = 0;
    this.rubbleCursor = 0;
    this.uniforms.count.value = 0;
    this.uniformDirty = true;
    this.lastFocus.set(1e9, 1e9, 1e9);
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
    const fracture = FractureCollider(box, point, unit, opening);
    const broken = { box, state, fracture, point: { x: point.x, y: point.y, z: point.z }, normal: unit };
    if (!deferTopology) this._Commit([broken]);
    return { damaged: true, broken: true, ratio, stage: 3, profile: state.profile.id, pending: broken };
  }

  Blast(position, radius, energy, { kind = "grenade" } = {}) {
    if (!this.battlefield || !(radius > 0) || !(energy > 0)) return { hits: 0, broken: 0 };
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
    return { hits, broken: broken.length };
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
      const breach = { id: this.nextBreachId++, ...fracture.volume, axis: fracture.axis };
      this.breaches.push(breach);
      this._SpawnRubble(breach, state.profile.surface);
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

  _SpawnRubble(breach, surface) {
    const half = breach.half;
    const axis = breach.axis;
    const seed = breach.id * 2654435761;
    const random = (index) => {
      const x = Math.sin(seed + index * 91.137) * 43758.5453;
      return x - Math.floor(x);
    };
    const planeAxes = axis === "x" ? [2, 1] : axis === "y" ? [0, 2] : [0, 1];
    const u = planeAxes[0], v = planeAxes[1];
    const pieces = axis === "y" ? 18 : 22;
    for (let i = 0; i < pieces; i += 1) {
      const edge = i % 4;
      const local = [0, 0, 0];
      if (edge < 2) {
        local[u] = (edge === 0 ? -1 : 1) * half[u] * (0.92 + random(i) * 0.12);
        local[v] = (random(i + 7) * 2 - 1) * half[v];
      } else {
        local[v] = (edge === 2 ? -1 : 1) * half[v] * (0.92 + random(i) * 0.12);
        local[u] = (random(i + 11) * 2 - 1) * half[u];
      }
      const depthAxis = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      local[depthAxis] = (random(i + 17) * 2 - 1) * Math.min(half[depthAxis], 0.20);
      const world = LocalToWorld({ x: local[0], y: local[1], z: local[2] }, breach.center, breach.ry);
      this.position.set(world.x, world.y, world.z);
      const size = 0.10 + random(i + 21) * (surface === "wood" ? 0.32 : 0.22);
      this.scale.set(size * (0.65 + random(i + 22)), size * (0.45 + random(i + 23)),
        size * (surface === "wood" ? 2.2 + random(i + 24) * 2.4 : 0.65 + random(i + 24)));
      this.euler.set(random(i + 30) * Math.PI, breach.ry + random(i + 31) * Math.PI,
        random(i + 32) * Math.PI);
      this.quaternion.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      const index = this.rubbleCursor % RUBBLE_CAPACITY;
      this.rubbleCursor += 1;
      this.rubble.setMatrixAt(index, this.matrix);
      this.rubble.setColorAt(index, SurfaceColor(surface, random(i + 41)));
      this.rubble.count = Math.min(RUBBLE_CAPACITY, Math.max(this.rubble.count, index + 1));
    }
    this.rubble.instanceMatrix.needsUpdate = true;
    if (this.rubble.instanceColor) this.rubble.instanceColor.needsUpdate = true;
  }

  Update(focus) {
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
      rubble: this.rubble.count,
      topologyRebuilds: this.topologyRebuilds,
      protectedHits: this.protectedHits,
    };
  }

  Dispose() {
    this.scene.remove(this.rubble);
    this.rubble.geometry.dispose();
    this.rubble.material.dispose();
    this.Clear();
  }
}
