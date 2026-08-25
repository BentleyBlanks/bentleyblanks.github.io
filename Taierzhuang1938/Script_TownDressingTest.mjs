// 城内每户布设（Data_Dressing_*.mjs）的硬规则校验。node 直跑、不启动 three：
//   node Taierzhuang1938/Script_TownDressingTest.mjs
//
// 几何真相来自 _import/TownDressingCells.json（Script_TownDressingDump 生成的
// 「户口册」）—— 城布局改了先重跑 dump，再跑本测试。
//
// 规则（每条都踩过对应的坑，出处见 Script_ExternalProps 文件头与地标注册表纪律）：
//   1  资产 id 必须在目录里；scale 0.55–1.35；坐标有限。
//   2  建筑级外部模型（house / houseRow / housePair / courtyardHouse / 碉堡 /
//      战壕地形 / 地面片）不进城 —— 城内的房子归程序化院落，一栋不许另盖。
//   3  全部落在城墙以内（max(|x|,|z|) ≤ 298）。
//   4  十字街口（±21 m 矩形）净空。
//   5  西门通视走廊（x ∈ [-305, 2]，|z| ≤ 5.35）不摆实心件。
//   6  街心不摆：任何非巷道街，|across| < width/2 − 1.0 即压路心；
//      巷道（hutong）两米宽，实心件一概不进。
//   7  地标与公共院落的保留区（w/d 半径 +2 m）不进 —— 那是地标构建器的地盘。
//   8  目标连线不挡：所在关卡相邻目标（含出生点→首目标）的连线 3 m 内，
//      不摆最大边长 > 1.4 m 的实心件（L2 东关排屋停摆事故的教训）。
//   9  分区各守其土：片区包（quarter）的每一件都要完整落进某一格院子
//      （格子四边收 0.55 m 当院墙）；街道包（street）贴街肩、不进院子；
//      城防包（defense）只在顺城街带 / 门里 / 缺口一带，也不进院子。
//  10  去重：任何两件 < 0.2 m 视为手误；跨文件 < 0.6 m 视为越区；
//      与 Script_ExternalProps 原有摆位 < 1.5 m 视为叠桩。
//
// 另有不红只报的提醒：件落在三个城内关全为 far 档的格子里（玩家路线不经过，
// 纯付 draw call 不见收益）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(path.join(projectDir, "_import", "TownDressingCells.json"), "utf8"));

const REGION_FILES = [
  "./Data_Dressing_NortheastQuarter.mjs",
  "./Data_Dressing_SoutheastQuarter.mjs",
  "./Data_Dressing_NorthwestQuarter.mjs",
  "./Data_Dressing_SouthwestQuarter.mjs",
  "./Data_Dressing_MainStreets.mjs",
  "./Data_Dressing_Defenses.mjs",
  "./Data_Dressing_EastSuburb.mjs",
  "./Data_Dressing_WestSuburb.mjs",
  "./Data_Dressing_NorthSuburb.mjs",
  "./Data_Dressing_JieheVillages.mjs",
];

const FORBIDDEN_IN_CITY = new Set([
  "house", "houseRow", "housePair", "courtyardHouse",
  "battlefieldPillbox", "battlefieldTrenchEarthwork", "battlefieldGroundPlane",
]);
// 上限（2026-08-25 起放宽）：视觉走流送后，件数的真正预算是「焦点附近同时活着
// 多少」+ 碰撞表规模，不再是全量 draw call。局部密度另有 45 m 邻域闸（规则 11）。
const CAPS = { quarter: 150, street: 130, defense: 90, outfield: 220 };
// 城外的主路净空带（西关的铁路/站台不在此表——那一包靠探针与截图兜）
const OUTFIELD_ROADS = [
  { id: "EastGateRoad", axis: "x", at: -65, from: 310, to: 620, half: 4.2 },
  { id: "NorthRoad", axis: "z", at: -145, from: -640, to: -310, half: 4.0 },
  { id: "JieheRoad", axis: "z", at: 0, from: -1620, to: -900, half: 4.5 },
];

const failures = [];
const notes = [];
let checks = 0;

function fail(message) { failures.push(message); }

function FootprintRadius(spec, scale) {
  return Math.max(spec.dims[0], spec.dims[2]) / 2 * scale;
}

function CircleIntersectsRect(x, z, r, rect) {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ);
  return dx * dx + dz * dz < r * r;
}

function CircleInsideRect(x, z, r, rect) {
  return x - r >= rect.minX && x + r <= rect.maxX && z - r >= rect.minZ && z + r <= rect.maxZ;
}

function CellRect(cell, shrink = 0) {
  return {
    minX: cell.x - cell.w / 2 + shrink, maxX: cell.x + cell.w / 2 - shrink,
    minZ: cell.z - cell.d / 2 + shrink, maxZ: cell.z + cell.d / 2 - shrink,
  };
}

function DistToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq === 0 ? 0
    : Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lengthSq));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

const blockerRects = [
  ...data.landmarks.map((l) => {
    const hw = (l.w || l.span || 12) / 2 + 2, hd = (l.d || l.span || 12) / 2 + 2;
    return { id: l.id, minX: l.x - hw, maxX: l.x + hw, minZ: l.z - hd, maxZ: l.z + hd };
  }),
  ...data.cityFeatures.map((f) => {
    const hw = (f.w || 16) / 2 + 2, hd = (f.d || 16) / 2 + 2;
    return { id: f.id, minX: f.x - hw, maxX: f.x + hw, minZ: f.z - hd, maxZ: f.z + hd };
  }),
];

const cityPhaseIds = new Set(["L4_Chengqiang", "L5_Shizijie", "L6_Beimen"]);
const segmentsByPhase = data.phases.map((phase) => {
  const points = [{ x: phase.spawn.x, z: phase.spawn.z }, ...phase.zones];
  const segments = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    segments.push([points[i].x, points[i].z, points[i + 1].x, points[i + 1].z]);
  }
  return { id: phase.id, bounds: phase.bounds, segments };
});

const cellLoad = new Map();   // 每格院子里摆了几件（规则 12：单院 ≤ 8）
const regions = [];
for (const file of REGION_FILES) {
  const module = await import(file);
  if (!module.REGION || !Array.isArray(module.PLACEMENTS)) {
    fail(`${file}: 必须导出 REGION 与 PLACEMENTS。`);
    continue;
  }
  regions.push({ file: path.basename(file), region: module.REGION, placements: module.PLACEMENTS });
}

const everything = [];   // {x, z, r, file, index, label} 供去重
for (const { file, region, placements } of regions) {
  const cap = CAPS[region.kind];
  checks += 1;
  if (cap == null) fail(`${file}: REGION.kind=${region.kind} 不认识。`);
  if (placements.length > cap) {
    fail(`${file}: ${placements.length} 件超出该区上限 ${cap} —— draw call 是全城共用的预算。`);
  }
  let farOnly = 0;
  placements.forEach((p, index) => {
    const label = `${file}[${index}] ${p.asset}@(${p.x},${p.z})`;
    checks += 1;
    const spec = data.assetDims[p.asset];
    if (!spec) { fail(`${label}: 目录里没有这个资产 id。`); return; }
    const scale = p.scale ?? 1;
    if (!(scale >= 0.55 && scale <= 1.35)) fail(`${label}: scale ${scale} 出 0.55–1.35。`);
    if (![p.x, p.z].every(Number.isFinite)) { fail(`${label}: 坐标非数。`); return; }
    if (p.ry != null && !(Math.abs(p.ry) <= 6.4)) fail(`${label}: ry ${p.ry} 不像弧度。`);
    if (FORBIDDEN_IN_CITY.has(p.asset)) fail(`${label}: 建筑级/地形级模型不进城（规则 2）。`);

    const r = FootprintRadius(spec, scale);
    const solid = spec.solid !== false;
    everything.push({ x: p.x, z: p.z, r, file, index, label });

    if (region.kind !== "outfield"
      && Math.max(Math.abs(p.x), Math.abs(p.z)) > 298) fail(`${label}: 出了城墙（规则 3）。`);
    if (Math.abs(p.x) <= 21 && Math.abs(p.z) <= 21) fail(`${label}: 压十字街口净空（规则 4）。`);
    if (solid && p.x >= -305 && p.x <= 2 && Math.abs(p.z) <= 5.35) {
      fail(`${label}: 压西门通视走廊（规则 5）。`);
    }

    for (const s of data.streets) {
      const along = s.axis === "x" ? p.x : p.z;
      const across = (s.axis === "x" ? p.z : p.x) - s.at;
      const inSpan = along >= Math.min(s.from, s.to) && along <= Math.max(s.from, s.to);
      if (!inSpan) continue;
      if (s.rank === "hutong") {
        if (solid && Math.abs(across) < s.width / 2 + r) {
          fail(`${label}: 实心件进了两米巷 ${s.id}（规则 6）。`);
        }
      } else if (Math.abs(across) < s.width / 2 - 1.0) {
        fail(`${label}: 压 ${s.id} 路心（规则 6）。`);
      }
    }

    for (const rect of blockerRects) {
      if (p.x > rect.minX && p.x < rect.maxX && p.z > rect.minZ && p.z < rect.maxZ) {
        fail(`${label}: 进了 ${rect.id} 的保留区（规则 7）。`);
      }
    }

    if (solid && Math.max(spec.dims[0], spec.dims[2]) * scale > 1.4) {
      for (const phase of segmentsByPhase) {
        const b = phase.bounds;
        if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) continue;
        for (const [ax, az, bx, bz] of phase.segments) {
          if (DistToSegment(p.x, p.z, ax, az, bx, bz) < 3.0) {
            fail(`${label}: 大件挡在 ${phase.id} 的目标连线上（规则 8）。`);
          }
        }
      }
    }

    const intersecting = data.cells.filter((cell) =>
      CircleIntersectsRect(p.x, p.z, Math.max(r, 0.1), CellRect(cell)));
    if (region.kind === "quarter") {
      if (p.x < region.bounds.minX || p.x > region.bounds.maxX
        || p.z < region.bounds.minZ || p.z > region.bounds.maxZ) {
        fail(`${label}: 出了本片区 ${region.id} 的范围（规则 9）。`);
      }
      const home = data.cells.find((cell) =>
        CircleInsideRect(p.x, p.z, r, CellRect(cell, 0.55)));
      if (!home) {
        fail(`${label}: 没有完整落进任何一格院子（含 0.55 m 院墙退让，规则 9）。`);
      } else {
        cellLoad.set(home.seed, (cellLoad.get(home.seed) || 0) + 1);
        const tiers = Object.entries(home.tiers)
          .filter(([id]) => cityPhaseIds.has(id)).map(([, tier]) => tier);
        if (tiers.length && tiers.every((tier) => tier === "far")) farOnly += 1;
      }
    } else {
      if (intersecting.length) {
        fail(`${label}: ${region.kind} 包压进了院子 ${intersecting[0].seed}（规则 9）。`);
      }
      if (region.kind === "street") {
        const near = data.streets.some((s) => {
          if (s.rank === "hutong") return false;
          const along = s.axis === "x" ? p.x : p.z;
          const across = (s.axis === "x" ? p.z : p.x) - s.at;
          return along >= Math.min(s.from, s.to) - 1 && along <= Math.max(s.from, s.to) + 1
            && Math.abs(across) <= s.width / 2 + 3.4;
        });
        if (!near) fail(`${label}: 街道包的件不在任何街肩带上（规则 9）。`);
      }
      if (region.kind === "defense") {
        const ring = Math.max(Math.abs(p.x), Math.abs(p.z)) >= 282;
        const nearGate = data.gates.some((g) => Math.hypot(p.x - g.x, p.z - g.z) <= 36);
        const nearBreach = data.breaches.some((b) => Math.hypot(p.x - b.x, p.z - b.z) <= 32);
        if (!ring && !nearGate && !nearBreach) {
          fail(`${label}: 城防包的件不在顺城街带/门里/缺口一带（规则 9）。`);
        }
      }
      if (region.kind === "outfield") {
        if (p.x < region.bounds.minX || p.x > region.bounds.maxX
          || p.z < region.bounds.minZ || p.z > region.bounds.maxZ) {
          fail(`${label}: 出了本区 ${region.id} 的范围（规则 9）。`);
        }
        // 城圈（含濠）不归城外包 —— 界河那一片 z ≤ -900 自然不受此限
        if (Math.max(Math.abs(p.x), Math.abs(p.z)) <= 311 && p.z > -640) {
          fail(`${label}: 城外包的件进了城圈/濠内（规则 9）。`);
        }
        if (solid) {
          for (const road of OUTFIELD_ROADS) {
            const along = road.axis === "x" ? p.x : p.z;
            const across = (road.axis === "x" ? p.z : p.x) - road.at;
            if (along >= road.from && along <= road.to
              && Math.abs(across) < road.half + Math.min(r, 1.0)) {
              fail(`${label}: 压了城外主路 ${road.id} 的净空带（规则 9）。`);
            }
          }
        }
      }
    }
  });
  if (farOnly) notes.push(`${file}: ${farOnly} 件落在城内三关全为 far 档的格子里 —— `
    + "玩家路线不经过，建议挪到 detail/mid 格。");
}

for (let i = 0; i < everything.length; i += 1) {
  for (let j = i + 1; j < everything.length; j += 1) {
    const a = everything[i], b = everything[j];
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    checks += 1;
    if (dist < 0.2) fail(`${a.label} 与 ${b.label} 重叠（< 0.2 m，规则 10）。`);
    else if (a.file !== b.file && dist < 0.6) {
      fail(`${a.label} 与 ${b.label} 跨文件贴桩（< 0.6 m，规则 10）。`);
    }
  }
}
for (const entry of everything) {
  for (const [phaseId, list] of Object.entries(data.basePlacements)) {
    void phaseId;
    for (const base of list) {
      if (Math.hypot(entry.x - base.x, entry.z - base.z) < 1.5) {
        fail(`${entry.label} 与原有摆位 ${base.asset}@(${base.x},${base.z}) 叠桩（规则 10）。`);
      }
    }
  }
}

// 规则 12：一格院子最多 8 件 —— 院里还得留人走动的地方。
for (const [seed, load] of cellLoad) {
  checks += 1;
  if (load > 8) fail(`院子 ${seed} 里摆了 ${load} 件（规则 12，单院上限 8）。`);
}

// 规则 11：局部密度闸。视觉有流送兜底，但 45 m 邻域里超过 90 件就不是
// 「生活气息」而是仓库了 —— 流送的稳态 live 数也是按这一档预估的。
{
  let flagged = 0;
  for (const entry of everything) {
    let near = 0;
    for (const other of everything) {
      const dx = entry.x - other.x, dz = entry.z - other.z;
      if (dx * dx + dz * dz < 45 * 45) near += 1;
    }
    checks += 1;
    if (near > 90 && flagged < 8) {
      fail(`${entry.label}: 45 m 邻域内挤了 ${near} 件（规则 11，上限 90）。`);
      flagged += 1;
    }
  }
}

const totals = regions.map(({ file, placements }) => `${file.replace("Data_Dressing_", "").replace(".mjs", "")}=${placements.length}`).join(" ");
for (const phase of data.phases) {
  const b = phase.bounds;
  const count = regions.flatMap((r) => r.placements)
    .filter((p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ).length;
  if (count) notes.push(`${phase.id}: 布设 ${count} 件进入本关切片。`);
}

if (failures.length) {
  console.error(`城内布设校验失败：${failures.length} 条（共查 ${checks} 项）`);
  for (const failure of failures.slice(0, 60)) console.error(`- ${failure}`);
  if (failures.length > 60) console.error(`- …另有 ${failures.length - 60} 条`);
  process.exit(1);
}
for (const note of notes) console.log(`提示：${note}`);
console.log(`城内布设校验通过：${checks} 项。各区件数 ${totals || "全空"}。`);
