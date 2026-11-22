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

  // Shift Beishahe objects (z >= SOURCE_START_Z):
  // - replace WA1 ordinary yard with authentic Guandi Temple (transplanted from Gengjiazhuang)
  // - cut side gate in MA3_WallR connecting MA3 to MA4 (Old Geng's yard)
  const ownObjects = [];
  for (const raw of baseDoc.objects) {
    if (!raw.pos || raw.pos[2] < SOURCE_START_Z) continue;
    if (raw.id.startsWith("WA1_")) continue;
    if (raw.id === "MA3_WallR") {
      // Wall spans z = 563.08..578.58; cut side gate cleanly at z = 564.8 facing MA4's open front courtyard & kitchen door
      ownObjects.push(
        {
          id: "MA3_WallR_North", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, 563.55], size: [0.5, 2.2, 0.95], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_WallR_South", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, 572.1], size: [0.5, 2.2, 13.0], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_SideGate_Door", asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [125.1, null, 564.8], size: [0.18, 2.0, 1.55], yawDeg: raw.yawDeg,
          hideOn: "SideGateOpen", group: "08–13合并/事件/便门",
        },
      );
      continue;
    }
    if (raw.id === "BshTree_04") {
      const moved = ShiftObject(raw);
      moved.pos = [120.5, null, 556.5];
      ownObjects.push(moved);
      continue;
    }
    ownObjects.push(ShiftObject(raw));
  }

  // 村落建筑多样性改造：打破原本 46 处院落高度/屋顶/材质完全一致的“兵营复制感”，
  // 按确定性分型赋予鲁南常见民居形态（双坡灰瓦硬山 / 草顶土坯农舍 / 砖瓦高脊大院 / 矮墙偏棚小院 / 炮损残垣院落），
  // 严格保护主流程可进院落（MA3/MA4/救护所/田嫂家/教堂/关帝庙）原有门洞与通行净空。
  const SKIP_DIVERSIFY = new Set(["MA3", "MA4", "Aid", "Tian", "Mat", "Church", "YBombed", "Merged"]);
  const compoundOrder = [];
  const compoundMap = new Map();
  for (const obj of ownObjects) {
    const m = /^([A-Za-z0-9]+)_(Wall|House)/.exec(obj.id);
    if (!m) continue;
    const prefix = m[1];
    if (SKIP_DIVERSIFY.has(prefix)) continue;
    if (!compoundMap.has(prefix)) {
      compoundMap.set(prefix, []);
      compoundOrder.push(prefix);
    }
    compoundMap.get(prefix).push(obj);
  }
  const HashStr = (str) => [...str].reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 7);
  const decorAdded = [];
  for (let idx = 0; idx < compoundOrder.length; idx++) {
    const prefix = compoundOrder[idx];
    const parts = compoundMap.get(prefix);
    const hVal = HashStr(prefix);
    // Rotate styles cleanly so neighboring compounds rarely share an archetype
    const style = (hVal + idx * 2) % 5;
    const isNorthFront = /^(NA|NB|NC)/.test(prefix);
    const walls = parts.filter((o) => o.id.startsWith(`${prefix}_Wall`));
    const roofs = parts.filter((o) => /_House\d+_Roof$/.test(o.id));
    const houseWalls = parts.filter((o) => /_House\d+/.test(o.id) && !/_Roof$/.test(o.id));

    if (style === 0) {
      // 双坡灰瓦硬山正房：屋顶加高脊二层坡顶与木梁，略微抬高正房体量
      for (const r of roofs) {
        const isMain = r.id.includes("House1");
        const lift = isMain ? 0.35 : 0.1;
        r.pos[1] = Fix(r.pos[1] + lift);
        r.size[1] = Fix(isMain ? 0.42 : 0.38);
        decorAdded.push({
          id: `${r.id}_Ridge`, asset: "Whitebox/Box", material: "Whitebox/Roof",
          pos: [r.pos[0], Fix(r.pos[1] + r.size[1] * 0.92), r.pos[2]],
          size: [Fix(r.size[0] * 0.94), Fix(isMain ? 0.55 : 0.4), Fix(r.size[2] * 0.52)],
          yawDeg: r.yawDeg, group: r.group,
        });
        if (isMain) {
          decorAdded.push({
            id: `${r.id}_Crest`, asset: "Whitebox/Box", material: "Whitebox/Structure",
            pos: [r.pos[0], Fix(r.pos[1] + r.size[1] + 0.5), r.pos[2]],
            size: [Fix(r.size[0] * 0.96), 0.22, 0.38],
            yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
      for (const hw of houseWalls) {
        if (hw.id.includes("House1") && hw.size[1] >= 2.5) hw.size[1] = Fix(hw.size[1] + 0.35);
      }
    } else if (style === 1) {
      // 草顶土坯农舍：暖黄麦秸苫顶 + 土坯墙色 + 砖砌灶台烟囱
      for (const w of walls) {
        w.material = "Whitebox/Step";
        w.size[1] = Fix(1.95 + (hVal % 3) * 0.1);
      }
      for (const hw of houseWalls) {
        if (hw.material === "Whitebox/Plaster") hw.material = "Whitebox/Step";
      }
      for (const r of roofs) {
        r.material = "Whitebox/Canvas";
        r.size[1] = 0.52;
        decorAdded.push({
          id: `${r.id}_ThatchCrown`, asset: "Whitebox/Box", material: "Whitebox/Canvas",
          pos: [r.pos[0], Fix(r.pos[1] + 0.46), r.pos[2]],
          size: [Fix(r.size[0] * 0.88), 0.48, Fix(r.size[2] * 0.56)],
          yawDeg: r.yawDeg, group: r.group,
        });
        if (r.id.includes("House1")) {
          const rad = (r.yawDeg || 0) * Math.PI / 180;
          const off = r.size[0] * 0.34;
          decorAdded.push({
            id: `${prefix}_Chimney`, asset: "Whitebox/Box", material: "Whitebox/Structure",
            pos: [Fix(r.pos[0] + Math.cos(rad) * off), Fix(r.pos[1] + 0.4), Fix(r.pos[2] - Math.sin(rad) * off)],
            size: [0.55, 1.35, 0.55], yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
    } else if (style === 2) {
      // 砖瓦高脊大户院：2.45m 高围墙带深灰瓦帽、高正房二层重檐、院角老树
      for (const w of walls) {
        w.size[1] = 2.45;
        decorAdded.push({
          id: `${w.id}_Coping`, asset: "Whitebox/Box", material: "Whitebox/Roof",
          pos: [w.pos[0], 2.75, w.pos[2]],
          size: [Fix(w.size[0] + 0.08), 0.16, Fix(w.size[2] + 0.08)],
          yawDeg: w.yawDeg, group: w.group, solid: false,
        });
      }
      for (const r of roofs) {
        const isMain = r.id.includes("House1");
        r.pos[1] = Fix(r.pos[1] + (isMain ? 0.55 : 0.25));
        r.size[1] = 0.45;
        decorAdded.push({
          id: `${r.id}_HighRidge`, asset: "Whitebox/Box", material: "Whitebox/Roof",
          pos: [r.pos[0], Fix(r.pos[1] + 0.4), r.pos[2]],
          size: [Fix(r.size[0] * 0.92), Fix(isMain ? 0.68 : 0.44), Fix(r.size[2] * 0.48)],
          yawDeg: r.yawDeg, group: r.group,
        });
      }
      for (const hw of houseWalls) {
        if (hw.id.includes("House1") && hw.size[1] >= 2.5) hw.size[1] = Fix(hw.size[1] + 0.55);
      }
      const mainRoof = roofs.find((r) => r.id.includes("House1"));
      const wallF = walls.find((w) => w.id.endsWith("_WallF_1"));
      if (mainRoof && wallF) {
        decorAdded.push({
          id: `${prefix}_YardTree`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
          pos: [Fix((mainRoof.pos[0] + wallF.pos[0]) * 0.5), null, Fix((mainRoof.pos[2] + wallF.pos[2]) * 0.5)],
          size: [0.46, Fix(5.2 + (hVal % 3) * 0.9), 0.46], group: mainRoof.group,
        });
      }
    } else if (style === 3) {
      // 土墙矮棚小院：1.75m 矮土院墙 + 偏房草棚顶 + 院内柴火垛
      for (const w of walls) {
        w.material = (hVal % 2 === 0) ? "Whitebox/EarthDark" : "Whitebox/Step";
        w.size[1] = 1.75;
      }
      for (const r of roofs) {
        if (r.id.includes("House2")) {
          r.material = "Whitebox/Canvas";
          r.pos[1] = Fix(r.pos[1] - 0.2);
          r.size[1] = 0.36;
        } else {
          r.material = "Whitebox/Roof";
          decorAdded.push({
            id: `${r.id}_LowPitch`, asset: "Whitebox/Box", material: "Whitebox/Roof",
            pos: [r.pos[0], Fix(r.pos[1] + 0.42), r.pos[2]],
            size: [Fix(r.size[0] * 0.9), 0.36, Fix(r.size[2] * 0.45)],
            yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
      const wallL = walls.find((w) => w.id.endsWith("_WallL"));
      const mainRoof = roofs.find((r) => r.id.includes("House1"));
      if (wallL && mainRoof) {
        decorAdded.push({
          id: `${prefix}_Firewood`, asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [Fix(wallL.pos[0] + (mainRoof.pos[0] > wallL.pos[0] ? 1.2 : -1.2)), null, Fix(wallL.pos[2])],
          size: [1.1, 0.95, 2.2], yawDeg: wallL.yawDeg, group: wallL.group,
        });
      }
    } else {
      // 炮损残垣院落（村北与村东临战感）：前/侧墙矮缺、正房残梁露椽、土石碎堆
      for (const w of walls) {
        w.material = isNorthFront ? "Whitebox/Step" : "Whitebox/Plaster";
        if (w.id.endsWith("_WallF_2") || w.id.endsWith("_WallB")) w.size[1] = 1.35;
      }
      for (const r of roofs) {
        if (r.id.includes("House1")) {
          r.material = "Whitebox/Roof";
          r.size[0] = Fix(r.size[0] * 0.78);
          decorAdded.push({
            id: `${r.id}_Rafter1`, asset: "Whitebox/Box", material: "Whitebox/Timber",
            pos: [r.pos[0], Fix(r.pos[1] + 0.36), r.pos[2]],
            size: [Fix(r.size[0] * 1.15), 0.16, 0.22], yawDeg: r.yawDeg, group: r.group,
          });
          decorAdded.push({
            id: `${r.id}_RemnantPitch`, asset: "Whitebox/Box", material: "Whitebox/Roof",
            pos: [r.pos[0], Fix(r.pos[1] + 0.44), r.pos[2]],
            size: [Fix(r.size[0] * 0.72), 0.38, Fix(r.size[2] * 0.48)], yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
    }
  }
  // 给老耿家（MA4）正房也加上鲁南硬山瓦脊与灶屋烟囱，增强主流程建筑辨识度（全在屋顶高度 y>=3m，不影响室内通行）
  const ma4MainRoof = ownObjects.find((o) => o.id === "MA4_House1_Roof");
  const ma4KitRoof = ownObjects.find((o) => o.id === "MA4_House2_Roof");
  if (ma4MainRoof) {
    decorAdded.push(
      {
        id: "MA4_House1_Ridge", asset: "Whitebox/Box", material: "Whitebox/Roof",
        pos: [ma4MainRoof.pos[0], Fix(ma4MainRoof.pos[1] + 0.48), ma4MainRoof.pos[2]],
        size: [9.6, 0.56, 2.8], yawDeg: ma4MainRoof.yawDeg, group: ma4MainRoof.group,
      },
      {
        id: "MA4_House1_Crest", asset: "Whitebox/Box", material: "Whitebox/Structure",
        pos: [ma4MainRoof.pos[0], Fix(ma4MainRoof.pos[1] + 1.02), ma4MainRoof.pos[2]],
        size: [9.8, 0.22, 0.36], yawDeg: ma4MainRoof.yawDeg, group: ma4MainRoof.group,
      },
    );
  }
  if (ma4KitRoof) {
    decorAdded.push({
      id: "MA4_Kitchen_Chimney", asset: "Whitebox/Box", material: "Whitebox/Structure",
      pos: [Fix(ma4KitRoof.pos[0] - 1.5), Fix(ma4KitRoof.pos[1] + 0.45), Fix(ma4KitRoof.pos[2] + 2.2)],
      size: [0.55, 1.4, 0.55], yawDeg: ma4KitRoof.yawDeg, group: ma4KitRoof.group,
    });
  }
  ownObjects.push(...decorAdded);

  // 鲁南田野乡土景物（消除外围麦田“空无一物”的失真感，同时提供自然遮挡与纵深参照）：
  // 严格避开官道、防战车壕、村内巷道及全部敌我行进路径。
  const AddStrawRick = (id, x, z, scale = 1) => {
    ownObjects.push(
      {
        id: `Merged_Rick_${id}_Base`, asset: "Whitebox/Box", material: "Whitebox/Step",
        pos: [x, null, z], size: [Fix(3.2 * scale), 0.32, Fix(3.0 * scale)], group: "08–13合并/田野/麦秸垛",
      },
      {
        id: `Merged_Rick_${id}_Body`, asset: "Whitebox/Box", material: "Whitebox/Canvas",
        pos: [x, null, z], size: [Fix(2.7 * scale), Fix(2.0 * scale), Fix(2.5 * scale)], group: "08–13合并/田野/麦秸垛",
      },
      {
        id: `Merged_Rick_${id}_Cap`, asset: "Whitebox/Box", material: "Whitebox/Canvas",
        pos: [x, Fix(2.0 * scale + 0.25), z], size: [Fix(1.8 * scale), Fix(0.65 * scale), Fix(1.7 * scale)], group: "08–13合并/田野/麦秸垛",
      },
    );
  };
  const AddBurialMound = (id, x, z, withTree = true) => {
    ownObjects.push(
      {
        id: `Merged_Mound_${id}_Base`, asset: "Whitebox/Box", material: "Whitebox/EarthDark",
        pos: [x, null, z], size: [4.2, 0.85, 3.8], yawDeg: (id * 23) % 45, group: "08–13合并/田野/坟头",
      },
      {
        id: `Merged_Mound_${id}_Top`, asset: "Whitebox/Box", material: "Whitebox/EarthDark",
        pos: [x, null, z], size: [2.4, 1.45, 2.2], yawDeg: (id * 23) % 45, group: "08–13合并/田野/坟头",
      },
    );
    if (withTree) {
      ownObjects.push({
        id: `Merged_Mound_${id}_Tree`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
        pos: [Fix(x + 2.4), null, Fix(z - 1.2)], size: [0.42, Fix(5.2 + (id % 3) * 1.1), 0.42], group: "08–13合并/田野/坟头",
      });
    }
  };
  const AddFieldHut = (id, x, z, yawDeg = 0) => {
    ownObjects.push(
      {
        id: `Merged_Hut_${id}_Roof`, asset: "Whitebox/Box", material: "Whitebox/Canvas",
        pos: [x, 2.35, z], size: [3.8, 0.35, 2.8], yawDeg, group: "08–13合并/田野/看青草棚",
      },
      {
        id: `Merged_Hut_${id}_Wall`, asset: "Whitebox/Box", material: "Whitebox/Step",
        pos: [x, null, Fix(z - 1.05)], size: [3.2, 2.1, 0.32], yawDeg, group: "08–13合并/田野/看青草棚",
      },
      {
        id: `Merged_Hut_${id}_Post1`, asset: "Whitebox/Box", material: "Whitebox/Timber",
        pos: [Fix(x - 1.45), null, Fix(z + 1.05)], size: [0.18, 2.15, 0.18], yawDeg, group: "08–13合并/田野/看青草棚",
      },
      {
        id: `Merged_Hut_${id}_Post2`, asset: "Whitebox/Box", material: "Whitebox/Timber",
        pos: [Fix(x + 1.45), null, Fix(z + 1.05)], size: [0.18, 2.15, 0.18], yawDeg, group: "08–13合并/田野/看青草棚",
      },
    );
  };
  const AddFieldFence = (id, x, z, len, yawDeg = 0) => {
    ownObjects.push({
      id: `Merged_Fence_${id}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [x, null, z], size: [len, 0.95, 0.22], yawDeg, group: "08–13合并/田野/篱笆",
    });
  };
  // 麦秸垛（分散在村西打麦外场、村北麦田、村东田头与南岸）
  for (const [idx, x, z, sc] of [
    [1, 34, 496, 1.05], [2, 38, 501, 0.85], [3, 28, 558, 1.1], [4, 33, 563, 0.82],
    [5, 24, 622, 1.0], [6, -18, 542, 0.95], [7, -42, 468, 1.05], [8, 62, 434, 0.9],
    [9, 168, 426, 1.1], [10, 173, 430, 0.82], [11, 238, 502, 1.0], [12, 244, 546, 0.95],
    [13, 250, 628, 1.05], [14, -18, 654, 0.9],
  ]) AddStrawRick(idx, x, z, sc);
  // 鲁南田间坟头与孤树（沟北压制线外侧、村西田野、村东田野）
  for (const [idx, x, z, tree] of [
    [1, 72, 396, true], [2, 162, 382, true], [3, 194, 438, true], [4, 18, 442, true],
    [5, -24, 510, true], [6, 16, 588, true], [7, -54, 616, true], [8, 258, 484, true],
    [9, 276, 594, true], [10, -112, 540, true],
  ]) AddBurialMound(idx, x, z, tree);
  // 田间看青草棚与篱笆
  AddFieldHut(1, 22, 526, 8);
  AddFieldHut(2, 178, 450, -12);
  AddFieldHut(3, 248, 594, 4);
  AddFieldHut(4, -26, 636, 15);
  AddFieldFence(1, 44, 506, 7.5, 86);
  AddFieldFence(2, 44, 570, 8.2, 88);
  AddFieldFence(3, 232, 524, 7.0, 92);
  AddFieldFence(4, 156, 456, 8.0, 6);
  // 沿田埂与灌溉水沟成行的榆柳树排（真实平原层次感）
  for (const [idx, x, z, h] of [
    [1, 8, 368, 6.4], [2, 8, 398, 5.8], [3, 8, 430, 7.1], [4, 8, 492, 6.2],
    [5, 8, 528, 6.8], [6, 8, 566, 5.9], [7, 8, 604, 6.5], [8, 8, 646, 5.7],
    [9, -34, 404, 6.2], [10, -34, 454, 5.6], [11, -34, 518, 6.9], [12, -34, 582, 6.1],
    [13, -34, 642, 5.8], [14, 146, 366, 6.5], [15, 146, 404, 5.9], [16, 206, 376, 7.0],
    [17, 206, 422, 6.3], [18, 206, 458, 5.8], [19, 272, 492, 6.4], [20, 272, 536, 7.2],
    [21, 272, 588, 6.1], [22, 272, 640, 6.7], [23, -108, 440, 6.4], [24, -108, 595, 6.9],
    [25, -108, 680, 6.2], [26, -24, 822, 6.6], [27, 46, 834, 7.1], [28, 126, 828, 6.3],
  ]) {
    ownObjects.push({
      id: `Merged_FieldTree_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.45, h, 0.45], group: "08–13合并/田野/树排",
    });
  }

  // Transplant iconic regional landmarks into FirstLevelMerged so the merged village keeps
  // strong visual orientation & Lunan local flavor without needing hint markers:
  const Transplant = (raw, dx, dz, group, idPrefix = "Merged_", patch = null) => {
    const obj = structuredClone(raw);
    obj.id = `${idPrefix}${raw.id}`;
    obj.pos = [Fix(raw.pos[0] + dx), raw.pos[1], Fix(raw.pos[2] + dz)];
    obj.group = group;
    if (obj.meta?.openings) {
      obj.meta.openings = obj.meta.openings.map((op) => ({
        ...op,
        p: Array.isArray(op.p) ? [Fix(op.p[0] + dx), Fix(op.p[1] + dz)] : op.p,
      }));
    }
    if (obj.meta?.room?.center) {
      obj.meta.room.center = [Fix(obj.meta.room.center[0] + dx), Fix(obj.meta.room.center[1] + dz)];
    }
    if (patch) patch(obj);
    ownObjects.push(obj);
  };

  // 1) 关帝庙（兼村塾，25 件）：替换 WA1 普通院落，紧邻北街西段与西胡同（ΔX=-4.2, ΔZ=+99.5）
  for (const raw of baseDoc.objects) {
    if (!/^House_TempleHall|^Temple(Guandi|Incense|Dropped|Fallen|Altar|Desk|YardWest|HallWest)/.test(raw.id)) continue;
    Transplant(raw, -4.2, 99.5, "08–13合并/地标/关帝庙", "Merged_", (obj) => {
      if (raw.id === "TempleYardWestSouth") {
        obj.pos[2] = 534.8;
        obj.size = [0.5, 2.4, 6.8];
      }
    });
  }
  // 2) 官道旁小土地庙（10 件）：村口官道东侧 [109, 418]（ΔX=0, ΔZ=-442）
  for (const raw of baseDoc.objects) {
    if (!/^RoadShrine/.test(raw.id)) continue;
    Transplant(raw, 0, -442, "08–13合并/地标/土地庙", "Merged_");
  }
  // 3) 村东北角高耸土炮楼（7.8m）：沟口东南视野地标 [219, 496]
  for (const raw of baseDoc.objects) {
    if (!/^WatchTower/.test(raw.id)) continue;
    Transplant(raw, 219 - 229.5, 496 - 390.5, "08–13合并/地标/土炮楼", "Merged_");
  }
  // 4) 村心大槐树（[132.5, 551.5]）与老石碾（[128, 553]）：位于主街/中街交汇广场，老耿家正门对面
  for (const raw of baseDoc.objects) {
    if (raw.id === "BigLocust") Transplant(raw, 132.5 - 121.5, 551.5 - 548.5, "08–13合并/地标/村心广场", "Merged_");
    if (raw.id === "MillBase" || raw.id === "MillStone") Transplant(raw, 128 - 77, 553 - 457, "08–13合并/地标/村心广场", "Merged_");
  }

  // Add road telegraph poles bridging z = 365..455 along x = -87 so west horizon is continuous
  for (const [idx, zPos] of [375, 410, 445].entries()) {
    ownObjects.push({
      id: `Merged_TelePole_${idx + 1}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [-87, null, zPos], size: [0.24, 7.6, 0.24], group: "08–13合并/其他/Tele",
    });
  }

  // 战术低矮掩体（土坎/沙包/枕木垛）：薄墙厚度 d=0.50m（半厚 0.25m，配合 COVER.standoffM 0.65m 留出
  // 0.40m 净距 > hitSlackM 0.30m 且 > 人物胶囊 0.34m，确保实机射线验证与可走性 100% 通过）；
  // 宽度 >= 3.2m 的掩体在左右两端各登记一个 cover.points（间隔 >= 1.8m），让两两跃进小组两人能并排躲在同一土坎后。
  // 全部严格避开官道中线、驴车与九四式车道、以及全员行走路径。
  for (const [id, x, z, w, h, d, fx, fz, yawDeg = 0] of [
    // 08c 沟北日军火力基准组（MergedRifles）两道跃进掩体土坎
    ["NorthBerm1", 144.0, 412.8, 4.4, 1.08, 0.50, 0, 1, 0],
    ["NorthBerm2", 136.5, 413.6, 4.2, 1.08, 0.50, 0, 1, 0],
    ["NorthBerm3", 130.0, 438.6, 4.6, 1.12, 0.50, 0, 1, 0],
    ["NorthBerm4", 123.0, 439.4, 4.2, 1.08, 0.50, 0, 1, 0],
    // 08c 官道两侧土堆掩体（MergedBoards 跃进架桥工兵组，避开 x=99..104 官道中线）
    ["RoadBerm1", 108.5, 434.2, 3.6, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm2", 94.0, 434.2, 3.6, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm3", 106.2, 456.8, 3.4, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm4", 93.2, 456.8, 3.4, 1.08, 0.50, 0, 1, 0],
    // 08d–09d 主街村心罗班长正面压制掩体（大槐树与石碾西侧沙袋垛，避开主街行车道）
    ["MainStBags", 130.2, 550.2, 3.8, 1.08, 0.50, 0, 1, 0],
    // 12b 铁路路基截击组（MergedRailAmbush）枕木与道砟堆掩体
    ["RailStones1", -72.8, 700.0, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    ["RailStones2", -76.5, 696.2, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    // 13b 桥北路基封锁机枪组（MergedBridgeGun）沙袋枕木阵位
    ["BridgeGunBags", -73.2, 695.4, 3.6, 1.08, 0.50, 0, 1, 0],
    // 13b–13d 南岸河堤顺子与刘文财反击沙袋掩体（堤北沿，避开南堤上坡线）
    ["SouthBankBags", -89.8, 795.6, 4.4, 1.08, 0.50, 0, -1, 0],
  ]) {
    const span = +(w * 0.27).toFixed(2);
    const points = w >= 3.2
      ? [{ x: +(x - span).toFixed(2), z }, { x: +(x + span).toFixed(2), z }]
      : [{ x, z }];
    ownObjects.push({
      id: `Merged_Cover_${id}`, asset: "Whitebox/Box", material: "Whitebox/Cover",
      pos: [x, null, z], size: [w, h, d], ...(yawDeg ? { yawDeg } : {}),
      cover: { faceX: fx, faceZ: fz, points }, meta: { planning: true },
      group: "08–13合并/战术掩体",
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
  // Drop crude solid dark-green Wheat_* rectangles (organic angled strips are rendered seamlessly via MergedPaperFields)
  const InSouth = (pts) => pts?.every((pt) => (Array.isArray(pt) ? pt[1] : pt.z) >= SOURCE_START_Z);
  const ShiftPaintEntry = (entry) => {
    const shifted = {
      ...entry,
      ...(entry.poly ? { poly: entry.poly.map(ShiftPoint) } : {}),
      ...(entry.line ? { line: entry.line.map(ShiftPoint) } : {}),
    };
    if (/^Garden_/.test(entry.id || "")) {
      shifted.color = "#a7ae84";
      shifted.strength = 0.38;
    } else if (entry.id === "Village" || entry.id === "Lizihang") {
      // 明亮的鲁南夯实黄土地基色（取代原本偏黑灰的 #8a8170，彻底消除巷道与打麦场外围像黑色阴影的问题）
      shifted.color = "#c6b99c";
      shifted.feather = 2.6;
    } else if (/^Road_|^GateYard$/.test(entry.id || "")) {
      shifted.color = "#e3dac2";
    } else if (entry.id === "ThreshingFloor") {
      shifted.color = "#d8cb9f";
      shifted.feather = 2.8;
    }
    return shifted;
  };
  const ownPaint = (baseDoc.paint || [])
    .filter((e) => InSouth(e.poly || e.line) && !/^Wheat_/.test(e.id || ""))
    .map(ShiftPaintEntry);
  // Add connecting official road paint from z=355 (sunken road mouth) past RoadShrine to z=467 (anti-tank ditch)
  // Plus subtle earthen field ridges (田埂) and irrigation ditches matching MergedPaperFields parcel borders
  ownPaint.unshift(
    {
      id: "MergedConnectRoad",
      line: [{ x: 99, z: 355 }, { x: 103, z: 392 }, { x: 103.5, z: 418 }, { x: 102, z: 440 }, { x: 99, z: 467 }],
      halfW: 2.6, feather: 0.8, color: "#dfd5bc",
    },
    { id: "FieldBund_W1", line: [{ x: 8, z: 355 }, { x: 8, z: 678 }], halfW: 0.55, feather: 0.35, color: "#baa886", strength: 0.72 },
    { id: "FieldBund_W2", line: [{ x: -34, z: 355 }, { x: -34, z: 676 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH1", line: [{ x: -74, z: 462 }, { x: 48, z: 462 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH2", line: [{ x: -74, z: 534 }, { x: 52, z: 534 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH3", line: [{ x: -74, z: 608 }, { x: 56, z: 608 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_N1", line: [{ x: 146, z: 355 }, { x: 146, z: 466 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_N2", line: [{ x: 206, z: 355 }, { x: 206, z: 466 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_E1", line: [{ x: 272, z: 466 }, { x: 272, z: 682 }], halfW: 0.55, feather: 0.35, color: "#baa886", strength: 0.72 },
    { id: "FieldBund_EH1", line: [{ x: 224, z: 536 }, { x: 318, z: 536 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_EH2", line: [{ x: 224, z: 612 }, { x: 318, z: 612 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
  );

  const ownRoads = [
    [{ x: 98.5, z: 344 }, { x: 99, z: 355 }, { x: 103, z: 392 }, { x: 103.5, z: 418 }, { x: 102, z: 440 }, { x: 99, z: 467 }],
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
    { id: "LmMergedTemple", name: "关帝庙（兼村塾）", x: 80.3, z: 526.5, kind: "place" },
    { id: "LmMergedRoadShrine", name: "小土地庙", x: 109.0, z: 418.0, kind: "place" },
    { id: "LmMergedWatchTower", name: "土炮楼", x: 219.0, z: 496.0, kind: "place" },
    { id: "LmMergedBigLocust", name: "大槐树", x: 132.5, z: 551.5, kind: "place" },
    { id: "LmMergedMill", name: "石碾", x: 128.0, z: 553.0, kind: "place" },
    { id: "LmMergedGengYard", name: "老耿家（中街西头）", x: 131.6, z: 569.5, kind: "place" },
    { id: "LmMergedSideGate", name: "夹壁便门", x: 125.1, z: 564.8, kind: "place" },
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
        name: "北沙河黄昏（田嫂家出村 z640 起转落日向西赶桥）",
        shape: "box",
        center: [80, 0, 775],
        size: [520, 400, 270],
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
