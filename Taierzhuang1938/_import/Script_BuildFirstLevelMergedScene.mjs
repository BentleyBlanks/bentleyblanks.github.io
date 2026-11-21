// 构建「北沙河单村合并版」变体场景 Scenes/FirstLevelMerged/：
//   - z < 355 实时继承自 FirstLevelEncounter（零复制：01–07 前沿防炮洞、交通沟、集结处、凹路战车唯一真源）
//   - z >= 355 由 FirstLevelEncounter 的北沙河片区（原 z >= 885）整体北移 ΔZ = -530m 生成（全长由 1440m 压至 910m）
//   - z = 355..375 做 20m sin² 地形高度平滑过渡，使 iz=0 与基线 row 1670 逐点零高差衔接
//   - 在北沙河村中街 MA3（邻院）与 MA4（老耿家）共用的隔墙 MA3_WallR 开出便门与可开关门板（hideOn: SideGateOpen）
//   - 同步生成 Environment_FirstLevelMerged.json（黄昏区域随村位北移 -530m）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DecodeSceneHeights, EncodeSceneHeights, FormatSceneJson, ValidateScene,
} from "../Script_SceneDoc.mjs";
import { DecodeTrenchDatum, EncodeTrenchDatum } from "../Script_SceneTrenches.mjs";
import { ResolveInheritedScene } from "../Script_SceneInherit.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(dirHere, "..");
const baseDir = path.join(projectDir, "Scenes/FirstLevelEncounter");
const outDir = path.join(projectDir, "Scenes/FirstLevelMerged");

const INHERIT_MAX_Z = 355;
const SOURCE_START_Z = 885;
const DELTA_Z = INHERIT_MAX_Z - SOURCE_START_Z; // -530m
const BLEND_ROWS = 40; // 20m smooth transition (z = 355..375, all north of z=373 ridge)

const Fix = (v) => Number(v.toFixed(4));
const ShiftPoint = (pt) => (Array.isArray(pt)
  ? [pt[0], Fix(pt[1] + DELTA_Z), ...pt.slice(2)]
  : { ...pt, z: Fix(pt.z + DELTA_Z) });

function ShiftObject(raw) {
  const obj = structuredClone(raw);
  if (Array.isArray(obj.pos)) obj.pos[2] = Fix(obj.pos[2] + DELTA_Z);
  if (obj.group?.startsWith("11–18/")) {
    obj.group = obj.group.replace(/^11–18\//, "08–13合并/");
  }
  if (obj.meta) {
    if (Array.isArray(obj.meta.waterRibbon)) {
      obj.meta.waterRibbon = obj.meta.waterRibbon.map(([x, nz, sz]) => [x, Fix(nz + DELTA_Z), Fix(sz + DELTA_Z)]);
    }
    if (Array.isArray(obj.meta.openings)) {
      obj.meta.openings = obj.meta.openings.map((op) => ({
        ...op,
        p: Array.isArray(op.p) ? [op.p[0], Fix(op.p[1] + DELTA_Z)] : op.p,
      }));
    }
    if (obj.meta.room?.center) {
      obj.meta.room.center = [obj.meta.room.center[0], Fix(obj.meta.room.center[1] + DELTA_Z)];
    }
    if (obj.meta.shelter && Number.isFinite(obj.meta.shelter.z)) {
      obj.meta.shelter.z = Fix(obj.meta.shelter.z + DELTA_Z);
    }
  }
  return obj;
}

function BuildMergedScene() {
  const baseDoc = JSON.parse(fs.readFileSync(path.join(baseDir, "Scene_FirstLevelEncounter.json"), "utf8"));
  const baseHeightBytes = fs.readFileSync(path.join(baseDir, baseDoc.terrain.file));
  const baseHeights = DecodeSceneHeights(baseHeightBytes, baseDoc.terrain);
  const baseDatumBytes = fs.readFileSync(path.join(baseDir, baseDoc.trenches.datum.file));
  const baseDatum = DecodeTrenchDatum(baseDoc.trenches.datum, baseDatumBytes);

  const { minX, minZ, cellM, cols, rows } = baseDoc.terrain;
  const width = cols + 1;
  const baseSplitRow = Math.round((INHERIT_MAX_Z - minZ) / cellM); // 1670
  const srcStartRow = Math.round((SOURCE_START_Z - minZ) / cellM); // 2730
  const outRows = rows - srcStartRow; // 1110 rows -> maxZ = 355 + 555 = 910

  const ownHeights = new Float32Array((outRows + 1) * width);
  for (let iz = 0; iz <= outRows; iz++) {
    const srcRow = srcStartRow + iz;
    ownHeights.set(baseHeights.subarray(srcRow * width, (srcRow + 1) * width), iz * width);
  }
  // Smoothly blend rows 0..BLEND_ROWS so row 0 matches base row 1670 identically (zero seam step).
  for (let iz = 0; iz <= BLEND_ROWS; iz++) {
    const t = iz / BLEND_ROWS;
    const w = Math.sin((Math.PI / 2) * t) ** 2;
    const northRow = Math.min(rows, baseSplitRow + iz);
    for (let ix = 0; ix < width; ix++) {
      const hNorth = baseHeights[baseSplitRow * width + ix] * (1 - t * 0.5) + baseHeights[northRow * width + ix] * (t * 0.5);
      const hSouth = ownHeights[iz * width + ix];
      ownHeights[iz * width + ix] = hNorth * (1 - w) + hSouth * w;
    }
  }

  // Shift datum patches in Beishahe (z >= SOURCE_START_Z)
  const ownDatum = baseDatum
    .filter((patch) => patch.minZ >= SOURCE_START_Z)
    .map((patch) => ({ ...patch, minZ: Fix(patch.minZ + DELTA_Z) }));

  // Shift Beishahe objects (z >= SOURCE_START_Z), replacing MA3_WallR with a side-gate opening to MA4 (Old Geng's home)
  const ownObjects = [];
  for (const raw of baseDoc.objects) {
    if (!raw.pos || raw.pos[2] < SOURCE_START_Z) continue;
    if (raw.id === "MA3_WallR") {
      const shiftedZ = Fix(raw.pos[2] + DELTA_Z); // 570.83, spans 563.08..578.58
      ownObjects.push(
        {
          id: "MA3_WallR_North", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, Fix(shiftedZ - 4.4)], size: [0.5, 2.2, 6.7], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_WallR_South", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, Fix(shiftedZ + 4.65)], size: [0.5, 2.2, 6.2], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_SideGate_Door", asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [125.1, null, Fix(shiftedZ + 0.35)], size: [0.18, 2.0, 1.55], yawDeg: raw.yawDeg,
          hideOn: "SideGateOpen", group: "08–13合并/事件/便门",
        },
      );
      continue;
    }
    ownObjects.push(ShiftObject(raw));
  }
  // Add road telegraph poles bridging z = 365..455 along x = -87 so west horizon is continuous
  for (const [idx, zPos] of [375, 410, 445].entries()) {
    ownObjects.push({
      id: `Merged_TelePole_${idx + 1}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [-87, null, zPos], size: [0.24, 7.6, 0.24], group: "08–13合并/其他/Tele",
    });
  }

  // Shift Beishahe trenches
  const ownSegments = (baseDoc.trenches?.segments || [])
    .filter((seg) => seg.points.every((pt) => pt[1] >= SOURCE_START_Z))
    .map((seg) => ({
      ...seg,
      group: seg.group?.replace(/^11–18\//, "08–13合并/") || seg.group,
      points: seg.points.map((pt) => [pt[0], Fix(pt[1] + DELTA_Z)]),
    }));

  // Shift Beishahe paint, ways, markers, backdrop paint
  const InSouth = (pts) => pts?.every((pt) => (Array.isArray(pt) ? pt[1] : pt.z) >= SOURCE_START_Z);
  const ShiftPaintEntry = (entry) => ({
    ...entry,
    ...(entry.poly ? { poly: entry.poly.map(ShiftPoint) } : {}),
    ...(entry.line ? { line: entry.line.map(ShiftPoint) } : {}),
  });
  const ownPaint = (baseDoc.paint || []).filter((e) => InSouth(e.poly || e.line)).map(ShiftPaintEntry);
  // Add connecting official road paint from z=355 (sunken road mouth) to z=467 (anti-tank ditch)
  ownPaint.unshift({
    id: "MergedConnectRoad",
    line: [{ x: 99, z: 355 }, { x: 97, z: 392 }, { x: 96, z: 430 }, { x: 99, z: 467 }],
    halfW: 2.6, feather: 0.8, color: "#cbbba0",
  });

  const ownRoads = [
    [{ x: 98.5, z: 344 }, { x: 99, z: 355 }, { x: 97, z: 392 }, { x: 96, z: 430 }, { x: 99, z: 467 }],
    ...(baseDoc.ways?.roads || [])
      .filter((line) => line.every((pt) => (pt.z ?? pt[1]) >= 995))
      .map((line) => line.map(ShiftPoint)),
  ];
  const ownWayTrenches = (baseDoc.ways?.trenches || [])
    .filter((line) => line.every((pt) => (pt.z ?? pt[1]) >= SOURCE_START_Z))
    .map((line) => line.map(ShiftPoint));

  const ownMarkers = [
    ...(baseDoc.markers || [])
      .filter((m) => m.z >= SOURCE_START_Z)
      .map((m) => ({ ...m, z: Fix(m.z + DELTA_Z) })),
    { id: "LmMergedGengYard", name: "老耿家（村中院）", x: 131.6, z: 569.5, kind: "place" },
    { id: "LmMergedSideGate", name: "邻院便门", x: 125.1, z: 571.2, kind: "place" },
    { id: "LmMergedWestYard", name: "西巷街坊院", x: 78.5, z: 530.0, kind: "place" },
  ];

  const maxZ = INHERIT_MAX_Z + outRows * cellM; // 910
  const mergedDoc = {
    schema: "tengxian-scene/1",
    id: "FirstLevelMerged",
    title: "第一关 · 北沙河单村合并版",
    inherit: { scene: "FirstLevelEncounter", maxZ: INHERIT_MAX_Z },
    source: {
      inheritedNorthFrom: "FirstLevelEncounter",
      inheritMaxZ: INHERIT_MAX_Z,
      beishaheShiftZ: DELTA_Z,
      builder: "Taierzhuang1938/_import/Script_BuildFirstLevelMergedScene.mjs",
    },
    bounds: { minX: -160, maxX: 320, minZ: INHERIT_MAX_Z, maxZ },
    spawn: { x: 98.5, z: 356, yawDeg: 180 },
    terrain: {
      file: "Scene_FirstLevelMerged.height.bin",
      encoding: "int16-cm-le",
      minX, minZ: INHERIT_MAX_Z, cellM, cols, rows: outRows,
    },
    look: baseDoc.look,
    backdrop: {
      ...baseDoc.backdrop,
      siteBounds: { minX: -160, maxX: 320, minZ: -480, maxZ },
      paint: (baseDoc.backdrop?.paint || []).filter((e) => InSouth(e.poly || e.line)).map(ShiftPaintEntry),
    },
    paint: ownPaint,
    ways: { roads: ownRoads, trenches: ownWayTrenches },
    trenches: {
      seed: baseDoc.trenches.seed,
      earthProfile: baseDoc.trenches.earthProfile,
      datum: {
        file: "Scene_FirstLevelMerged.trench.bin",
        encoding: "int16-cm-le",
        patches: ownDatum.map(({ minX: px, minZ: pz, cellM: pc, cols: pCols, rows: pRows }) => ({
          minX: px, minZ: pz, cellM: pc, cols: pCols, rows: pRows,
        })),
      },
      segments: ownSegments,
    },
    markers: ownMarkers,
    objects: ownObjects,
  };

  const check = ValidateScene(mergedDoc);
  if (!check.ok) throw new Error(`FirstLevelMerged 校验未通过：\n${check.errors.join("\n")}`);

  const resolved = ResolveInheritedScene(mergedDoc, ownHeights, ownDatum, {
    doc: baseDoc, heights: baseHeights, datum: baseDatum,
  });
  const resolvedCheck = ValidateScene(resolved.doc);
  if (!resolvedCheck.ok) throw new Error(`合成后场景校验未通过：\n${resolvedCheck.errors.join("\n")}`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.json"), FormatSceneJson(mergedDoc), "utf8");
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.height.bin"), EncodeSceneHeights(ownHeights));
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.trench.bin"), EncodeTrenchDatum(ownDatum));

  const envDoc = {
    schema: "tengxian-env-scene/1",
    scene: "FirstLevelMerged",
    time: { hour: 12, speed: 0.1, paused: true },
    volumes: [
      { id: "Fallback", name: "兜底（全场）", shape: "global", priority: 0, blendS: 0, mode: "full", preset: "FirstLevelEncounter" },
      {
        id: "BeishaheDusk",
        name: "北沙河黄昏（凹路出口 z355 起到南界）",
        shape: "box",
        center: [80, 0, 635],
        size: [520, 400, 560],
        priority: 10,
        blendS: 20,
        mode: "full",
        preset: "FirstLevelEncounterDusk",
      },
    ],
  };
  fs.writeFileSync(path.join(outDir, "Environment_FirstLevelMerged.json"), JSON.stringify(envDoc, null, 2) + "\n", "utf8");

  console.log(
    `Built FirstLevelMerged: southRows=${outRows}, southObjects=${ownObjects.length}, `
    + `resolvedRows=${resolved.doc.terrain.rows}, resolvedObjects=${resolved.doc.objects.length}, maxZ=${maxZ}`,
  );
}

BuildMergedScene();
