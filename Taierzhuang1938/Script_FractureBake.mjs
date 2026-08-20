// 《滕县 一九三八》离线预破碎模板生成器。
//
// 运行：node Taierzhuang1938/Script_FractureBake.mjs
// 校验：node Taierzhuang1938/Script_FractureBake.mjs --check
//
// 运行时绝不临时发明破口。这里用固定种子生成十二边不规则轮廓，把洞内体积
// 切成能严丝合缝拼回轮廓的内、中、外三圈碎片，并烘出 Rapier 使用的保守矩形代理。
// 生成结果提交进 Data_FracturePatterns.mjs；游戏只读生成结果，因此同一命中在
// 所有机器上都会得到同一缺口、同一批碎片和同一套物理近似。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const segmentCount = 12;
const patternCount = 6;
const gridSize = 6;
const seeds = [0x19380316, 0x19380317, 0x19380318, 0x19380319, 0x19380320, 0x19380321];

function MakeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function Round(value) { return Number(value.toFixed(5)); }

function MakeRadii(random) {
  const radii = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const tooth = index % 2 === 0 ? -0.035 : 0.035;
    radii.push(0.79 + random() * 0.19 + tooth);
  }
  // 避免相邻尖角跨度过大，同时保留明显的进退变化。
  return radii.map((radius, index) => {
    const previous = radii[(index + segmentCount - 1) % segmentCount];
    const next = radii[(index + 1) % segmentCount];
    return Round(radius * 0.72 + (previous + next) * 0.14);
  });
}

function PolarPoint(radius, angle) {
  return [Round(Math.cos(angle) * radius), Round(Math.sin(angle) * radius)];
}

function MakeFragment(points, ring, sector) {
  const anchor = [
    Round(points.reduce((sum, point) => sum + point[0], 0) / points.length),
    Round(points.reduce((sum, point) => sum + point[1], 0) / points.length),
  ];
  return {
    ring,
    sector,
    anchor,
    points: points.map((point) => [Round(point[0] - anchor[0]), Round(point[1] - anchor[1])]),
  };
}

function MakeFragments(radii, angleOffset, random) {
  const fragments = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    const angleA = angleOffset + index * Math.PI * 2 / segmentCount;
    const angleB = angleOffset + (index + 1) * Math.PI * 2 / segmentCount;
    const innerScaleA = 0.24 + random() * 0.08;
    const innerScaleB = 0.24 + random() * 0.08;
    const middleScaleA = 0.57 + random() * 0.10;
    const middleScaleB = 0.57 + random() * 0.10;
    const edgeA = PolarPoint(radii[index], angleA);
    const edgeB = PolarPoint(radii[next], angleB);
    const innerA = PolarPoint(radii[index] * innerScaleA, angleA);
    const innerB = PolarPoint(radii[next] * innerScaleB, angleB);
    const middleA = PolarPoint(radii[index] * middleScaleA, angleA);
    const middleB = PolarPoint(radii[next] * middleScaleB, angleB);
    fragments.push(MakeFragment([[0, 0], innerA, innerB], "core", index));
    fragments.push(MakeFragment([innerA, middleA, middleB, innerB], "middle", index));
    fragments.push(MakeFragment([middleA, edgeA, edgeB, middleB], "rim", index));
  }
  return fragments;
}

function SampleRadius(radii, angleOffset, angle) {
  const turn = Math.PI * 2;
  let normalized = (angle - angleOffset) / turn;
  normalized -= Math.floor(normalized);
  const sector = normalized * segmentCount;
  const index = Math.floor(sector) % segmentCount;
  const next = (index + 1) % segmentCount;
  const blend = sector - Math.floor(sector);
  return radii[index] + (radii[next] - radii[index]) * blend;
}

function MakePhysicsRects(radii, angleOffset) {
  const cells = [];
  for (let row = 0; row < gridSize; row += 1) {
    cells[row] = [];
    for (let column = 0; column < gridSize; column += 1) {
      const x = -1 + (column + 0.5) * 2 / gridSize;
      const y = -1 + (row + 0.5) * 2 / gridSize;
      const radius = Math.hypot(x, y);
      // 只把明确落在视觉实体一侧的格子留下，避免不可见碰撞侵入缺口。
      cells[row][column] = radius > SampleRadius(radii, angleOffset, Math.atan2(y, x)) + 0.055;
    }
  }

  const runs = [];
  for (let row = 0; row < gridSize; row += 1) {
    let start = -1;
    for (let column = 0; column <= gridSize; column += 1) {
      const solid = column < gridSize && cells[row][column];
      if (solid && start < 0) start = column;
      if (!solid && start >= 0) {
        runs.push({ start, end: column, rowStart: row, rowEnd: row + 1 });
        start = -1;
      }
    }
  }

  // 相邻行横向区间相同就纵向合并，控制每个洞的 Rapier 代理数量。
  const merged = [];
  for (const run of runs) {
    const previous = merged.find((candidate) => candidate.start === run.start
      && candidate.end === run.end && candidate.rowEnd === run.rowStart);
    if (previous) previous.rowEnd = run.rowEnd;
    else merged.push({ ...run });
  }
  return merged.map((rect) => {
    const x0 = -1 + rect.start * 2 / gridSize;
    const x1 = -1 + rect.end * 2 / gridSize;
    const y0 = -1 + rect.rowStart * 2 / gridSize;
    const y1 = -1 + rect.rowEnd * 2 / gridSize;
    return {
      center: [Round((x0 + x1) * 0.5), Round((y0 + y1) * 0.5)],
      half: [Round((x1 - x0) * 0.5), Round((y1 - y0) * 0.5)],
    };
  });
}

function BakePatterns() {
  return seeds.slice(0, patternCount).map((seed, index) => {
    const random = MakeRandom(seed);
    const angleOffset = Round((random() - 0.5) * Math.PI / segmentCount);
    const radii = MakeRadii(random);
    return {
      id: `fracture${String(index + 1).padStart(2, "0")}`,
      angleOffset,
      radii,
      physicsRects: MakePhysicsRects(radii, angleOffset),
      fragments: MakeFragments(radii, angleOffset, random),
    };
  });
}

function Signature(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function Serialize(patterns) {
  const payload = JSON.stringify(patterns, null, 2);
  const signature = Signature(payload);
  return `// 由 Script_FractureBake.mjs 离线生成；不要手改。\n`
    + `// 固定种子签名 ${signature}。运行时只读，不做随机破碎。\n\n`
    + `export const FRACTURE_SEGMENT_COUNT = ${segmentCount};\n`
    + `export const FRACTURE_BAKE_SIGNATURE = "${signature}";\n`
    + `export const FRACTURE_PATTERNS = Object.freeze(${payload});\n\n`
    + `export function FracturePatternAt(index) {\n`
    + `  const count = FRACTURE_PATTERNS.length;\n`
    + `  return FRACTURE_PATTERNS[((index % count) + count) % count];\n`
    + `}\n`;
}

const modulePath = fileURLToPath(import.meta.url);
const outputPath = path.join(path.dirname(modulePath), "Data_FracturePatterns.mjs");
const output = Serialize(BakePatterns());
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  // Git for Windows 可能按 core.autocrlf 把已提交生成物检出为 CRLF；模板内容仍应
  // 确定一致，校验不能把平台换行误报成破碎数据漂移。
  if (current.replace(/\r\n/g, "\n") !== output.replace(/\r\n/g, "\n")) {
    console.error("Data_FracturePatterns.mjs 与离线生成器不一致");
    process.exit(1);
  }
  console.log("预破碎模板确定性校验通过");
} else {
  fs.writeFileSync(outputPath, output, "utf8");
  console.log(`已生成 ${path.basename(outputPath)}：${patternCount} 组 / 每组 ${segmentCount * 3} 块 / ${FractureProxySummary(BakePatterns())}`);
}

function FractureProxySummary(patterns) {
  return `代理 ${patterns.map((pattern) => pattern.physicsRects.length).join("/")}`;
}
