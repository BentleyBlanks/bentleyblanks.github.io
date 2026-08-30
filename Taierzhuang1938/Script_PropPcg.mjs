// 工事 / 生活用具 PCG 的确定性规则层。不 import three。
//
// 输入是 Data_PropPcg 的文档 + 当前切片的真实环境：bounds、院落 cells、碰撞 AABB、
// 手摆件、地面高度。输出仍是 ExternalProps 认识的普通 placement，因此渲染、流送、
// GPU instancing 与可选碰撞不会分叉出第二套实现。自动小物默认 solid:false：生成时
// 仍严格避开真实碰撞，但不会拿随机桶凳改写 AI 导航、射界或玩家移动。
//
// 生成顺序固定为 volume → anchor → template → item；每一步只用 HashString/Mulberry32，
// 禁止 Math.random。同一个院落 seed 在不同章节切片里会得到同一个世界落点。

import { HashString, Mulberry32 } from "./Script_Noise.mjs";
import { MakeRoadPath } from "./Script_RoadPath.mjs";
import {
  PROP_PCG_SCHEMA_VERSION, PROP_PCG_ASSET_RULES, PROP_PCG_PROFILES,
} from "./Data_PropPcg.mjs";

const TWO_PI = Math.PI * 2;

function Finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function CopyBounds(raw = {}) {
  const minX = Finite(raw.minX);
  const maxX = Finite(raw.maxX);
  const minZ = Finite(raw.minZ);
  const maxZ = Finite(raw.maxZ);
  return {
    minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ),
  };
}

function IntersectBounds(a, b) {
  if (!a) return b ? CopyBounds(b) : null;
  if (!b) return CopyBounds(a);
  const out = {
    minX: Math.max(a.minX, b.minX), maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ), maxZ: Math.min(a.maxZ, b.maxZ),
  };
  return out.minX < out.maxX && out.minZ < out.maxZ ? out : null;
}

function InBounds(x, z, bounds, inset = 0) {
  return !!bounds && x >= bounds.minX + inset && x <= bounds.maxX - inset
    && z >= bounds.minZ + inset && z <= bounds.maxZ - inset;
}

function RandomRange(random, range, fallback = 1) {
  if (!Array.isArray(range) || range.length < 2) return fallback;
  const lo = Finite(range[0], fallback), hi = Finite(range[1], fallback);
  return lo + (hi - lo) * random();
}

function WeightedPick(random, entries) {
  let total = 0;
  for (const entry of entries) total += Math.max(0, Finite(entry.weight, 1));
  if (!(total > 0)) return entries[0] || null;
  let pick = random() * total;
  for (const entry of entries) {
    pick -= Math.max(0, Finite(entry.weight, 1));
    if (pick <= 0) return entry;
  }
  return entries[entries.length - 1] || null;
}

function CircleHitsAabb(x, z, radius, box, padding = 0) {
  if (!box || !box.min || !box.max) return false;
  const minX = Finite(box.min[0]), maxX = Finite(box.max[0]);
  const minZ = Finite(box.min[2]), maxZ = Finite(box.max[2]);
  const nearestX = Clamp(x, minX, maxX);
  const nearestZ = Clamp(z, minZ, maxZ);
  const dx = x - nearestX, dz = z - nearestZ;
  const r = Math.max(0, radius + padding);
  return dx * dx + dz * dz < r * r;
}

function InExclusion(x, z, exclusion) {
  if (!exclusion || exclusion.enabled === false) return false;
  if (exclusion.shape === "circle") {
    const dx = x - Finite(exclusion.x), dz = z - Finite(exclusion.z);
    const radius = Math.max(0, Finite(exclusion.radius));
    return dx * dx + dz * dz <= radius * radius;
  }
  return InBounds(x, z, CopyBounds(exclusion.bounds || exclusion), 0);
}

function SlopeAt(groundAt, x, z, radius) {
  if (typeof groundAt !== "function") return 0;
  const d = Math.max(0.35, Math.min(1.4, radius));
  const west = Finite(groundAt(x - d, z));
  const east = Finite(groundAt(x + d, z));
  const north = Finite(groundAt(x, z - d));
  const south = Finite(groundAt(x, z + d));
  return Math.max(Math.abs(east - west), Math.abs(south - north)) / (d * 2);
}

function FootprintFor(item, scale) {
  const rule = PROP_PCG_ASSET_RULES[item.asset];
  return rule ? rule.radius * scale : 0;
}

function CellBounds(cell, inset) {
  const halfW = Math.max(0, Finite(cell.w) / 2 - inset);
  const halfD = Math.max(0, Finite(cell.d) / 2 - inset);
  if (halfW <= 0 || halfD <= 0) return null;
  return {
    minX: Finite(cell.x) - halfW, maxX: Finite(cell.x) + halfW,
    minZ: Finite(cell.z) - halfD, maxZ: Finite(cell.z) + halfD,
  };
}

function StableUnit(seed) { return (HashString(String(seed)) >>> 0) / 0xffffffff; }

function CandidateCells(volume, cells, worldBounds, volumeSeed) {
  const volumeBounds = IntersectBounds(CopyBounds(volume.bounds), worldBounds);
  if (!volumeBounds) return [];
  const chance = Clamp(Finite(volume.chance, 1), 0, 1);
  const inset = Math.max(0, Finite(volume.inset, 1.5));
  const candidates = [];
  for (const cell of cells || []) {
    if (!cell || !InBounds(Finite(cell.x), Finite(cell.z), volumeBounds)) continue;
    const bounds = IntersectBounds(CellBounds(cell, inset), volumeBounds);
    if (!bounds) continue;
    const rank = StableUnit(`${volumeSeed}:${cell.seed || `${cell.x}:${cell.z}`}:rank`);
    if (rank > chance) continue;
    candidates.push({ cell, bounds, rank });
  }
  candidates.sort((a, b) => a.rank - b.rank
    || String(a.cell.seed || "").localeCompare(String(b.cell.seed || "")));
  return candidates.slice(0, Math.max(0, Math.round(Finite(volume.maxAnchors, candidates.length))));
}

function RectCandidates(volume, worldBounds, random) {
  const bounds = IntersectBounds(CopyBounds(volume.bounds), worldBounds);
  if (!bounds) return [];
  const inset = Math.max(0, Finite(volume.inset, 0));
  const width = Math.max(0, bounds.maxX - bounds.minX - inset * 2);
  const depth = Math.max(0, bounds.maxZ - bounds.minZ - inset * 2);
  if (!(width > 0 && depth > 0)) return [];
  const count = Math.max(0, Math.round(Number.isFinite(Number(volume.count))
    ? Number(volume.count) : width * depth * Math.max(0, Finite(volume.density, 0.01))));
  const attempts = Math.max(count, count * Math.max(1, Math.round(Finite(volume.attemptsPerAnchor, 30))));
  const candidates = [];
  for (let i = 0; i < attempts; i += 1) {
    candidates.push({
      bounds,
      x: bounds.minX + inset + random() * width,
      z: bounds.minZ + inset + random() * depth,
    });
  }
  return { count, candidates };
}

/**
 * 沿 Catmull-Rom 中心线按弧长生成候选。每个槽位拥有独立随机流，所以另一章节
 * 只截到半条线时，留下来的模块不会跟着换型号、朝向或尺度。
 */
function SplineCandidates(volume, volumeSeed) {
  let path = null;
  try { path = MakeRoadPath(volume.points); } catch (error) { return []; }
  const start = Clamp(Finite(volume.startInset, 0), 0, path.length);
  const end = Clamp(path.length - Finite(volume.endInset, 0), start, path.length);
  const span = end - start;
  const spacing = Math.max(0.75, Finite(volume.spacing, 3));
  const count = Math.max(0, Math.round(span / spacing));
  if (!count) return [];
  const stride = span / count;
  const sideOffset = Finite(volume.sideOffset, 0);
  const sideJitter = Math.max(0, Finite(volume.sideJitter, 0));
  const alongJitter = Math.min(stride * 0.34, Math.max(0, Finite(volume.alongJitter, 0)));
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const random = Mulberry32(HashString(`${volumeSeed}:spline:${index}`) >>> 0);
    const nominal = start + (index + 0.5) * stride;
    const s = Clamp(nominal + (random() * 2 - 1) * alongJitter, start, end);
    const point = path.At(s);
    const side = sideOffset + (random() * 2 - 1) * sideJitter;
    candidates.push({
      x: point.x - point.tz * side,
      z: point.z + point.tx * side,
      yaw: Math.atan2(-point.tz, point.tx),
      random,
    });
  }
  return candidates;
}

function ExpandTemplate({ anchor, profile, template, random, volume }) {
  const baseYaw = Number.isFinite(Number(anchor.yaw)) ? Number(anchor.yaw)
    : (Number.isFinite(Number(volume.axisYaw)) ? Number(volume.axisYaw) : random() * TWO_PI);
  const yaw = baseYaw + (random() * 2 - 1) * Math.max(0, Finite(profile.yawJitter, 0));
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const items = [];
  for (let index = 0; index < template.items.length; index += 1) {
    const item = template.items[index];
    if (item.chance != null && random() > Clamp(Finite(item.chance, 1), 0, 1)) continue;
    const scale = Number.isFinite(Number(item.scale))
      ? Number(item.scale) : RandomRange(random, profile.scaleRange, 1);
    const offset = item.offset || [0, 0];
    const ox = Finite(offset[0]), oz = Finite(offset[1]);
    items.push({
      asset: item.asset,
      x: anchor.x + ox * cos + oz * sin,
      z: anchor.z - ox * sin + oz * cos,
      ry: yaw + Finite(item.ry),
      scale,
      radius: FootprintFor(item, scale),
      itemIndex: index,
    });
  }
  return { yaw, items };
}

function ValidateCluster({ items, volume, profile, context, accepted, anchors, anchor }) {
  const worldBounds = context.bounds ? CopyBounds(context.bounds) : null;
  const volumeBounds = IntersectBounds(CopyBounds(volume.bounds), worldBounds);
  const exclusions = volume.exclusions || [];
  const blockers = context.blockers || [];
  const fixed = context.fixedPlacements || [];
  const minSpacing = Math.max(0, Finite(volume.minSpacing, 0));
  for (const other of anchors) {
    const dx = anchor.x - other.x, dz = anchor.z - other.z;
    if (dx * dx + dz * dz < minSpacing * minSpacing) return "spacing";
  }
  for (const item of items) {
    if (!(item.radius > 0)) return "asset";
    if (!InBounds(item.x, item.z, volumeBounds, item.radius)) return "bounds";
    if (exclusions.some((entry) => InExclusion(item.x, item.z, entry))) return "exclusion";
    if (SlopeAt(context.groundAt, item.x, item.z, item.radius)
      > Math.max(0, Finite(profile.maxSlope, 1))) return "slope";
    for (const box of blockers) {
      if (CircleHitsAabb(item.x, item.z, item.radius, box,
        Math.max(0, Finite(profile.itemClearance, 0)))) return "collision";
    }
    const fixedClearance = Math.max(0, Finite(profile.fixedClearance, 0.3));
    for (const other of fixed) {
      const dx = item.x - Finite(other.x), dz = item.z - Finite(other.z);
      const otherRule = PROP_PCG_ASSET_RULES[other.asset];
      const otherRadius = otherRule ? otherRule.radius * Finite(other.scale, 1) : 0.45;
      const limit = item.radius + otherRadius + fixedClearance;
      if (dx * dx + dz * dz < limit * limit) return "fixed";
    }
    for (const other of accepted) {
      const dx = item.x - other.x, dz = item.z - other.z;
      const sameLineOverlap = other.pcgVolume === volume.id
        ? Math.max(0, Finite(profile.lineOverlap, 0)) : 0;
      const limit = Math.max(0, item.radius + other.radius
        + Math.max(0, Finite(profile.itemClearance, 0)) - sameLineOverlap);
      if (dx * dx + dz * dz < limit * limit) return "generated";
    }
  }
  return null;
}

function Stats() {
  return {
    volumes: 0, anchors: 0, placements: 0, attempts: 0,
    rejected: { asset: 0, bounds: 0, exclusion: 0, slope: 0, collision: 0,
      fixed: 0, generated: 0, spacing: 0 },
    byVolume: {}, byProfile: {},
  };
}

/**
 * 文档校验只看结构与资产引用，不需要浏览器。编辑器导入与测试共用。
 */
export function ValidatePropPcgDocument(document, { assetIds = null } = {}) {
  const errors = [];
  if (!document || typeof document !== "object") return ["文档必须是对象"];
  if (Number(document.version) !== PROP_PCG_SCHEMA_VERSION) {
    errors.push(`version 必须是 ${PROP_PCG_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(document.volumes)) errors.push("volumes 必须是数组");
  const ids = new Set();
  for (const [index, volume] of (document.volumes || []).entries()) {
    const prefix = `volumes[${index}]`;
    if (!volume || typeof volume !== "object") { errors.push(`${prefix} 必须是对象`); continue; }
    if (!volume.id || ids.has(volume.id)) errors.push(`${prefix}.id 缺失或重复`);
    ids.add(volume.id);
    if (!PROP_PCG_PROFILES[volume.profile]) errors.push(`${prefix}.profile 不存在：${volume.profile}`);
    if (!new Set(["rect", "cells", "spline"]).has(volume.shape)) {
      errors.push(`${prefix}.shape 只认 rect/cells/spline`);
    }
    const bounds = CopyBounds(volume.bounds);
    if (!(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ)) errors.push(`${prefix}.bounds 无面积`);
    if (volume.shape === "spline") {
      if (!Array.isArray(volume.points) || volume.points.length < 2
        || volume.points.some((point) => !Array.isArray(point) || point.length < 2
          || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1])))) {
        errors.push(`${prefix}.points 至少要两个有限 XZ 控制点`);
      }
      if (!(Finite(volume.spacing) > 0)) errors.push(`${prefix}.spacing 必须大于 0`);
    }
  }
  const known = assetIds ? new Set(assetIds) : null;
  for (const profile of Object.values(PROP_PCG_PROFILES)) {
    for (const template of profile.templates) {
      for (const item of template.items) {
        if (!PROP_PCG_ASSET_RULES[item.asset]) errors.push(`${profile.id}/${template.id} 缺 footprint：${item.asset}`);
        if (known && !known.has(item.asset)) errors.push(`${profile.id}/${template.id} 资产库不存在：${item.asset}`);
      }
    }
  }
  return errors;
}

/** 编辑器导入用的限幅/补缺；不修改调用方对象。 */
export function NormalizePropPcgDocument(document) {
  const source = document && typeof document === "object" ? document : {};
  return {
    version: PROP_PCG_SCHEMA_VERSION,
    seed: Math.round(Finite(source.seed, 19380317)),
    volumes: (Array.isArray(source.volumes) ? source.volumes : []).slice(0, 64).map((raw, index) => {
      const bounds = CopyBounds(raw.bounds);
      return {
        id: String(raw.id || `PcgVolume${index + 1}`).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 48),
        label: String(raw.label || raw.id || `撒点区 ${index + 1}`).slice(0, 48),
        enabled: raw.enabled !== false,
        profile: PROP_PCG_PROFILES[raw.profile] ? raw.profile : "householdLife",
        shape: new Set(["rect", "spline"]).has(raw.shape) ? raw.shape : "cells",
        bounds: {
          minX: Clamp(bounds.minX, -2500, 2500), maxX: Clamp(bounds.maxX, -2500, 2500),
          minZ: Clamp(bounds.minZ, -2500, 2500), maxZ: Clamp(bounds.maxZ, -2500, 2500),
        },
        seedOffset: Math.round(Finite(raw.seedOffset, index * 101)),
        chance: Clamp(Finite(raw.chance, 0.16), 0, 1),
        count: Clamp(Math.round(Finite(raw.count, 5)), 0, 256),
        maxAnchors: Clamp(Math.round(Finite(raw.maxAnchors, 12)), 0, 256),
        attemptsPerAnchor: Clamp(Math.round(Finite(raw.attemptsPerAnchor, 30)), 1, 100),
        inset: Clamp(Finite(raw.inset, 1.5), 0, 20),
        minSpacing: Clamp(Finite(raw.minSpacing, 6), 0, 80),
        axisYaw: raw.axisYaw != null && Number.isFinite(Number(raw.axisYaw))
          ? Number(raw.axisYaw) : null,
        points: Array.isArray(raw.points) ? raw.points.slice(0, 32).map((point) => [
          Clamp(Finite(point?.[0]), -2500, 2500), Clamp(Finite(point?.[1]), -2500, 2500),
        ]) : [],
        spacing: Clamp(Finite(raw.spacing, 3.2), 0.75, 80),
        startInset: Clamp(Finite(raw.startInset, 0), 0, 80),
        endInset: Clamp(Finite(raw.endInset, 0), 0, 80),
        sideOffset: Clamp(Finite(raw.sideOffset, 0), -20, 20),
        sideJitter: Clamp(Finite(raw.sideJitter, 0), 0, 8),
        alongJitter: Clamp(Finite(raw.alongJitter, 0), 0, 8),
        exclusions: Array.isArray(raw.exclusions) ? raw.exclusions.slice(0, 32) : [],
      };
    }),
  };
}

/**
 * @returns {{placements:Array, stats:Object, errors:Array}}
 */
export function GeneratePropPcg(document, context = {}) {
  const errors = ValidatePropPcgDocument(document, { assetIds: context.assetIds });
  const stats = Stats();
  if (errors.length) return { placements: [], stats, errors };
  const placements = [];
  const accepted = [];
  const worldBounds = context.bounds ? CopyBounds(context.bounds) : null;

  for (const volume of document.volumes) {
    if (volume.enabled === false) continue;
    const profile = PROP_PCG_PROFILES[volume.profile];
    if (!profile || !IntersectBounds(CopyBounds(volume.bounds), worldBounds)) continue;
    stats.volumes += 1;
    const volumeStats = { anchors: 0, placements: 0, attempts: 0, rejected: {} };
    stats.byVolume[volume.id] = volumeStats;
    const anchors = [];
    const seed = (HashString(`${document.seed}:${volume.id}:${Finite(volume.seedOffset)}`) >>> 0);
    const random = Mulberry32(seed);
    const tryAnchor = (anchor, anchorRandom = random) => {
      stats.attempts += 1;
      volumeStats.attempts += 1;
      const template = WeightedPick(anchorRandom, profile.templates);
      if (!template) return false;
      const cluster = ExpandTemplate({ anchor, profile, template, random: anchorRandom, volume });
      const reason = ValidateCluster({
        items: cluster.items, volume, profile, context, accepted, anchors, anchor,
      });
      if (reason) {
        stats.rejected[reason] = (stats.rejected[reason] || 0) + 1;
        volumeStats.rejected[reason] = (volumeStats.rejected[reason] || 0) + 1;
        return false;
      }
      const anchorIndex = anchors.length;
      anchors.push({ x: anchor.x, z: anchor.z });
      for (const item of cluster.items) {
        const assetRule = PROP_PCG_ASSET_RULES[item.asset];
        const placement = {
          asset: item.asset, x: item.x, z: item.z, ry: item.ry, scale: item.scale,
          solid: assetRule?.solid === true,
          note: `PCG ${volume.label} · ${template.label}`,
          pcg: true, pcgVolume: volume.id, pcgProfile: profile.id,
          pcgTemplate: template.id, pcgAnchor: anchorIndex,
        };
        placements.push(placement);
        accepted.push({ ...placement, radius: item.radius });
      }
      stats.anchors += 1;
      stats.placements += cluster.items.length;
      volumeStats.anchors += 1;
      volumeStats.placements += cluster.items.length;
      stats.byProfile[profile.id] = (stats.byProfile[profile.id] || 0) + cluster.items.length;
      return true;
    };

    if (volume.shape === "cells") {
      const candidates = CandidateCells(volume, context.cells || [], worldBounds, seed);
      const attemptsPerAnchor = Math.max(1, Math.round(Finite(volume.attemptsPerAnchor, 24)));
      for (const candidate of candidates) {
        // 每一户有自己的随机流：另一章少建了几格院子时，不得让后面同一户的
        // 模板、偏移与朝向跟着变。世界坐标跨关稳定靠的是这条，不是遍历顺序。
        const cellRandom = Mulberry32(HashString(
          `${seed}:${candidate.cell.seed || `${candidate.cell.x}:${candidate.cell.z}`}`,
        ) >>> 0);
        for (let attempt = 0; attempt < attemptsPerAnchor; attempt += 1) {
          const anchor = {
            x: candidate.bounds.minX + cellRandom() * (candidate.bounds.maxX - candidate.bounds.minX),
            z: candidate.bounds.minZ + cellRandom() * (candidate.bounds.maxZ - candidate.bounds.minZ),
          };
          if (tryAnchor(anchor, cellRandom)) break;
        }
      }
    } else if (volume.shape === "rect") {
      const rect = RectCandidates(volume, worldBounds, random);
      let made = 0;
      for (const anchor of rect.candidates) {
        if (made >= rect.count) break;
        if (tryAnchor(anchor)) made += 1;
      }
    } else {
      for (const anchor of SplineCandidates(volume, seed)) tryAnchor(anchor, anchor.random);
    }
  }
  return { placements, stats, errors };
}

export function PropPcgSummary(result) {
  if (!result) return "PCG 未运行";
  if (result.errors?.length) return `PCG 配置错误 ${result.errors.length} 条`;
  const rejected = Object.values(result.stats?.rejected || {}).reduce((sum, value) => sum + value, 0);
  return `${result.stats.placements} 件 / ${result.stats.anchors} 组 / `
    + `${result.stats.volumes} 区，拒绝 ${rejected} 次`;
}
