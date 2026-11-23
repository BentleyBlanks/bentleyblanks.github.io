// 构建「北沙河单村合并版」变体场景 Scenes/FirstLevelMerged/：
//   - z < 355 实时继承自 FirstLevelEncounter（零复制：01–07 前沿防炮洞、交通沟、集结处、凹路战车唯一真源）
//   - z >= 355 由 FirstLevelEncounter 的北沙河片区（原 z >= 885）整体北移 ΔZ = -530m 生成，
//     并在平坦村心切缝 z = 606（原 z = 1136）处无损插入 EXPAND_Z = +80m 南扩带（maxZ = 990m）
//   - 同步向东西外扩（x = 20..268）并把村内 4 处大空洞加密为紧贴/共墙的鲁南合院群与 3–4m 曲折胡同，
//     使北沙河成为约 250m × 270m、百余座院落的真实鲁南交通要冲大村（对齐 1938 年史料规模与鲁南高密街巷风貌）
//   - z = 355..375 做 20m sin² 地形高度平滑过渡，使 iz=0 与基线 row 1670 逐点零高差衔接
//   - 在北沙河村中街 MA3（邻院）与 MA4（老耿家）共用的隔墙 MA3_WallR 开出便门与可开关门板（hideOn: SideGateOpen）
//   - 同步生成 Environment_FirstLevelMerged.json（黄昏区域随村南扩位同步南移 +80m）

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
const SPLIT_Z = 606;                            // 平坦切缝（合并坐标 z=606，对应源 z=1136）
const SOURCE_SPLIT_Z = SPLIT_Z - DELTA_Z;       // 1136
const EXPAND_Z = 80;                            // 村落向南无损扩展 80m（maxZ: 910 -> 990）
const BLEND_ROWS = 40;                          // 20m smooth transition (z = 355..375, all north of z=373 ridge)

const Fix = (v) => Number(v.toFixed(4));
const MapZ = (srcZ, forceSouth = null) => {
  const shifted = srcZ + DELTA_Z;
  const south = forceSouth !== null ? forceSouth : shifted >= SPLIT_Z;
  return Fix(shifted + (south ? EXPAND_Z : 0));
};
const ShiftPoint = (pt, forceSouth = null) => (Array.isArray(pt)
  ? [pt[0], MapZ(pt[1], forceSouth), ...pt.slice(2)]
  : { ...pt, z: MapZ(pt.z, forceSouth) });

function IsSouthObject(raw) {
  if (raw.id.startsWith("WB2_")) return false;
  if (raw.id.startsWith("GE1_") || raw.id.startsWith("Well_3_")) return true;
  return (raw.pos[2] + DELTA_Z) >= SPLIT_Z;
}

function ShiftObject(raw) {
  const obj = structuredClone(raw);
  const south = IsSouthObject(raw);
  const dz = DELTA_Z + (south ? EXPAND_Z : 0);
  if (Array.isArray(obj.pos)) obj.pos[2] = Fix(obj.pos[2] + dz);
  if (obj.group?.startsWith("11–18/")) {
    obj.group = obj.group.replace(/^11–18\//, "08–13合并/");
  }
  if (obj.meta) {
    if (Array.isArray(obj.meta.waterRibbon)) {
      obj.meta.waterRibbon = obj.meta.waterRibbon.map(([x, nz, sz]) => [x, Fix(nz + dz), Fix(sz + dz)]);
    }
    if (Array.isArray(obj.meta.openings)) {
      obj.meta.openings = obj.meta.openings.map((op) => ({
        ...op,
        p: Array.isArray(op.p) ? [op.p[0], Fix(op.p[1] + dz)] : op.p,
      }));
    }
    if (obj.meta.room?.center) {
      obj.meta.room.center = [obj.meta.room.center[0], Fix(obj.meta.room.center[1] + dz)];
    }
    if (obj.meta.shelter && Number.isFinite(obj.meta.shelter.z)) {
      obj.meta.shelter.z = Fix(obj.meta.shelter.z + dz);
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
  const baseSplitRow = Math.round((INHERIT_MAX_Z - minZ) / cellM);  // 1670
  const srcStartRow = Math.round((SOURCE_START_Z - minZ) / cellM);  // 2730
  const srcSplitRow = Math.round((SOURCE_SPLIT_Z - minZ) / cellM);  // 3232
  const expandRows = Math.round(EXPAND_Z / cellM);                  // 160
  const northCount = srcSplitRow - srcStartRow;                     // 502 (z=355..606)
  const southCount = rows - srcSplitRow;                            // 608 (z=686..990)
  const outRows = northCount + expandRows + southCount;             // 1270 -> maxZ = 990

  const ownHeights = new Float32Array((outRows + 1) * width);
  // 1) North half: z = 355 .. 606
  for (let iz = 0; iz <= northCount; iz++) {
    const srcRow = srcStartRow + iz;
    ownHeights.set(baseHeights.subarray(srcRow * width, (srcRow + 1) * width), iz * width);
  }
  // 2) Flat expansion band: z = 606.5 .. 686 (linearly bridges srcSplitRow -> srcSplitRow+1; keeps railway at x=-80 straight & level)
  const rowA = baseHeights.subarray(srcSplitRow * width, (srcSplitRow + 1) * width);
  const rowB = baseHeights.subarray(Math.min(rows, srcSplitRow + 1) * width, (Math.min(rows, srcSplitRow + 1) + 1) * width);
  for (let k = 1; k <= expandRows; k++) {
    const t = k / (expandRows + 1);
    const dstOff = (northCount + k) * width;
    for (let ix = 0; ix < width; ix++) {
      ownHeights[dstOff + ix] = rowA[ix] * (1 - t) + rowB[ix] * t;
    }
  }
  // 3) South half: z = 686.5 .. 990 (Aid, Tian, Church, River, RailwayBridge, SouthBank)
  for (let iz = 1; iz <= southCount; iz++) {
    const srcRow = srcSplitRow + iz;
    const dstRow = northCount + expandRows + iz;
    ownHeights.set(baseHeights.subarray(srcRow * width, (srcRow + 1) * width), dstRow * width);
  }
  // 4) Smoothly blend rows 0..BLEND_ROWS so row 0 matches base row 1670 identically (zero seam step).
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

  // Shift datum patches in Beishahe (z >= SOURCE_START_Z; north trench datum patch stays at z=471..498)
  const ownDatum = baseDatum
    .filter((patch) => patch.minZ >= SOURCE_START_Z)
    .map((patch) => ({ ...patch, minZ: MapZ(patch.minZ) }));

  // Shift Beishahe objects (z >= SOURCE_START_Z):
  // - replace WA1 ordinary yard with authentic Guandi Temple (transplanted from Gengjiazhuang)
  // - cut side gate in MA3_WallR connecting MA3 to MA4 (Old Geng's yard)
  // - skip TeleWire_06 (which spanned z=575..610 across split) and bridge cleanly below
  const ownObjects = [];
  for (const raw of baseDoc.objects) {
    if (!raw.pos || raw.pos[2] < SOURCE_START_Z) continue;
    if (raw.id.startsWith("WA1_")) continue;
    if (raw.id === "TeleWire_06") continue;
    if (raw.id === "MA3_WallR") {
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

  // 村落建筑多样性改造：打破原本院落高度/屋顶/材质完全一致的“兵营复制感”，
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
    const style = (hVal + idx * 2) % 5;
    const isNorthFront = /^(NA|NB|NC)/.test(prefix);
    const walls = parts.filter((o) => o.id.startsWith(`${prefix}_Wall`));
    const roofs = parts.filter((o) => /_House\d+_Roof$/.test(o.id));
    const houseWalls = parts.filter((o) => /_House\d+/.test(o.id) && !/_Roof$/.test(o.id));

    if (style === 0) {
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

  // ============================================================================
  // 方案 A：北沙河鲁南百户大村扩建与高密院落生成器（约 250m × 270m，总计 ~100 座院落）
  // 还原 1938 滕县北沙河村（约 500 余人、百余户、240 余间房被焚）真实体量与鲁南紧凑窄巷风貌：
  //   - 院墙厚 0.46m（与 DeriveCoversFromColliders 契约对齐，每处街角门垛均自动派生可用 AI 掩体）
  //   - 5 种鲁南民居分型（灰瓦硬山 / 草顶土坯 / 高脊砖瓦大院 / 矮墙偏棚小院 / 临街商铺残垣）
  //   - 填实原村 4 处 25–50m 空旷断带 + 东西扩翼 + 新建 z=606..686 村心南半部两排紧凑民居与 3–4m 曲折胡同
  // ============================================================================
  const AddLunanYard = (id, cx, cz, w, d, opts = {}) => {
    const hVal = HashStr(id);
    const style = opts.style ?? (hVal % 5);
    const gateSide = opts.gateSide || "S"; // S/N/E/W
    const yawDeg = opts.yawDeg ?? (((hVal % 7) - 3) * 0.45);
    const group = `08–13合并/建筑/${id}`;
    const wallT = 0.46;
    const wallH = style === 2 ? 2.4 : style === 3 ? 1.78 : style === 1 ? 1.98 : 2.18;
    const wallMat = style === 1 ? "Whitebox/Step" : style === 3 ? (hVal % 2 ? "Whitebox/EarthDark" : "Whitebox/Step") : "Whitebox/Plaster";
    const roofMat = style === 1 ? "Whitebox/Canvas" : "Whitebox/Roof";
    const mainH = style === 2 ? 3.45 : style === 0 ? 3.15 : style === 3 ? 2.75 : 2.95;
    const hw = w / 2, hd = d / 2;
    const gateW = 2.1;
    const rad = (yawDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const LocalToWorld = (lx, lz) => [Fix(cx + lx * cos + lz * sin), Fix(cz - lx * sin + lz * cos)];
    const Push = (suffix, lx, y, lz, sw, sh, sd, mat, extra = {}) => {
      const [wx, wz] = LocalToWorld(lx, lz);
      ownObjects.push({
        id: `${id}_${suffix}`, asset: "Whitebox/Box", material: mat,
        pos: [wx, y, wz], size: [Fix(sw), Fix(sh), Fix(sd)],
        ...(yawDeg ? { yawDeg: Fix(yawDeg) } : {}), group, ...extra,
      });
    };

    // 1) Perimeter courtyard walls (with a real 2.1m gate opening on gateSide + timber gate lintel)
    const AddSideWall = (sideName, isHoriz, offset, span, hasGate) => {
      if (!hasGate) {
        if (isHoriz) Push(`Wall${sideName}`, 0, null, offset, span, wallH, wallT, wallMat);
        else Push(`Wall${sideName}`, offset, null, 0, wallT, wallH, span, wallMat);
        return;
      }
      const seg = Math.max(1.2, (span - gateW) / 2);
      const midOff = gateW / 2 + seg / 2;
      if (isHoriz) {
        Push(`Wall${sideName}_1`, -midOff, null, offset, seg, wallH, wallT, wallMat);
        Push(`Wall${sideName}_2`, midOff, null, offset, seg, wallH, wallT, wallMat);
        Push(`GateLintel`, 0, Fix(wallH + 0.15), offset, gateW + 0.5, 0.34, wallT + 0.14, "Whitebox/Timber", { solid: false });
      } else {
        Push(`Wall${sideName}_1`, offset, null, -midOff, wallT, wallH, seg, wallMat);
        Push(`Wall${sideName}_2`, offset, null, midOff, wallT, wallH, seg, wallMat);
        Push(`GateLintel`, offset, Fix(wallH + 0.15), 0, wallT + 0.14, 0.34, gateW + 0.5, "Whitebox/Timber", { solid: false });
      }
    };
    AddSideWall("N", true, -hd + wallT / 2, w, gateSide === "N");
    AddSideWall("S", true, hd - wallT / 2, w, gateSide === "S");
    AddSideWall("W", false, -hw + wallT / 2, d - wallT * 2, gateSide === "W");
    AddSideWall("E", false, hw - wallT / 2, d - wallT * 2, gateSide === "E");

    // 2) Main house (正房) tucked on the side opposite the gate (or north side for E/W gates)
    const houseDepth = Math.min(4.8, Math.max(3.6, d * 0.36));
    const houseWidth = Math.max(5.4, w - 1.4);
    const houseZ = gateSide === "N" ? (hd - wallT - houseDepth / 2 - 0.1) : (-hd + wallT + houseDepth / 2 + 0.1);
    Push("House1_Body", 0, null, houseZ, houseWidth, mainH, houseDepth, wallMat);
    const roofY = Fix(mainH + 0.28);
    Push("House1_Roof", 0, roofY, houseZ, houseWidth + 0.7, style === 1 ? 0.48 : 0.4, houseDepth + 0.7, roofMat);
    if (style === 1) {
      Push("House1_ThatchCrown", 0, Fix(roofY + 0.44), houseZ, houseWidth * 0.88, 0.46, houseDepth * 0.56, "Whitebox/Canvas");
      Push("Chimney", houseWidth * 0.32, Fix(roofY + 0.45), houseZ, 0.52, 1.3, 0.52, "Whitebox/Structure");
    } else if (style === 2) {
      Push("House1_HighRidge", 0, Fix(roofY + 0.42), houseZ, houseWidth * 0.92, 0.64, houseDepth * 0.48, "Whitebox/Roof");
      Push("House1_Crest", 0, Fix(roofY + 0.82), houseZ, houseWidth * 0.95, 0.22, 0.36, "Whitebox/Structure");
    } else if (style === 4) {
      // 临街商铺/残梁风貌
      Push("House1_Rafter", 0, Fix(roofY + 0.36), houseZ, houseWidth * 0.96, 0.18, 0.26, "Whitebox/Timber");
      Push("House1_Ridge", 0, Fix(roofY + 0.38), houseZ, houseWidth * 0.78, 0.42, houseDepth * 0.46, "Whitebox/Roof");
    } else {
      Push("House1_Ridge", 0, Fix(roofY + 0.36), houseZ, houseWidth * 0.92, 0.48, houseDepth * 0.5, "Whitebox/Roof");
    }

    // 3) Side wing (厢房/偏棚) on ~75% of compounds to form authentic Lunan 三合院/四合院 enclosure
    if (opts.wing !== false && d >= 10.5 && w >= 10.5 && (hVal % 4 !== 0 || opts.wing === true)) {
      const wingEast = (hVal % 2 === 0 && gateSide !== "E") || gateSide === "W";
      const wingW = Math.min(3.5, w * 0.28);
      const wingD = Math.max(4.0, d - houseDepth - 2.6);
      const wingX = wingEast ? (hw - wallT - wingW / 2 - 0.1) : (-hw + wallT + wingW / 2 + 0.1);
      const wingZ = gateSide === "N" ? (-hd + wallT + wingD / 2 + 0.4) : (houseZ + houseDepth / 2 + wingD / 2 + 0.35);
      const wingH = Fix(mainH - 0.52);
      const wingRoofMat = style === 3 ? "Whitebox/Canvas" : roofMat;
      Push("House2_Body", wingX, null, wingZ, wingW, wingH, wingD, wallMat);
      Push("House2_Roof", wingX, Fix(wingH + 0.22), wingZ, wingW + 0.5, 0.34, wingD + 0.5, wingRoofMat);
    }

    // 4) Courtyard tree or firewood stack for lived-in village silhouette
    if (hVal % 3 === 0 && d >= 11) {
      const treeX = (hVal % 2 === 0 ? -1 : 1) * (hw * 0.38);
      const treeZ = gateSide === "N" ? -hd * 0.35 : hd * 0.22;
      Push("YardTree", treeX, null, treeZ, 0.44, Fix(4.8 + (hVal % 3) * 0.95), 0.44, "Whitebox/Foliage");
    } else if (style === 3) {
      Push("Firewood", -hw * 0.42, null, hd * 0.25, 1.1, 0.9, 2.0, "Whitebox/Timber");
    }
  };

  // --- 1) 填实村北西/打麦场周边原 70×50m 大空洞（保留西胡同 x=84..90、关帝庙 x=67.8..86、紧凑打麦场 17×15m、主街、大槐树石碾）---
  AddLunanYard("Exp_NW_A", 99.0, 524.8, 12.0, 9.6, { gateSide: "S", yawDeg: 0, wing: false });
  AddLunanYard("Exp_NW_B", 60.4, 526.8, 10.2, 11.4, { gateSide: "N", yawDeg: 0 });
  AddLunanYard("Exp_WM_A", 74.2, 548.8, 12.4, 11.2, { gateSide: "E", yawDeg: 0 });
  AddLunanYard("Exp_WM_B", 97.5, 550.2, 12.4, 9.6, { gateSide: "S", yawDeg: 0, wing: false });
  AddLunanYard("Exp_WM_C", 112.0, 550.2, 12.2, 9.6, { gateSide: "S", yawDeg: 0, wing: false });

  // --- 3) 村西外扩翼（x = 22..49，隔 3.5m 曲折西外胡同 x≈51，填实 18 座紧凑鲁南合院）---
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_W1_1", 28.5, 504.5, 13.0, 13.0, "S"], ["Exp_W1_2", 42.5, 504.5, 13.0, 13.0, "S"],
    ["Exp_W2_1", 28.5, 527.5, 13.0, 13.0, "N"], ["Exp_W2_2", 42.5, 527.5, 13.0, 13.0, "N"],
    ["Exp_W3_1", 28.5, 548.0, 13.0, 14.0, "S"], ["Exp_W3_2", 42.5, 548.0, 13.0, 14.0, "S"],
    ["Exp_W4_1", 28.5, 576.0, 13.0, 14.0, "N"], ["Exp_W4_2", 42.5, 576.0, 13.0, 14.0, "N"],
    ["Exp_W5_1", 29.0, 596.0, 13.0, 14.0, "S"], ["Exp_W5_2", 43.0, 596.0, 13.0, 14.0, "S"],
    ["Exp_W6_1", 29.5, 622.5, 13.0, 15.0, "S"], ["Exp_W6_2", 43.5, 622.5, 13.0, 15.0, "S"],
    ["Exp_W7_1", 31.0, 652.0, 13.0, 13.6, "N"], ["Exp_W7_2", 45.0, 652.0, 13.0, 13.6, "N"],
    ["Exp_W7_3", 32.5, 673.0, 13.0, 13.6, "S"], ["Exp_W7_4", 46.5, 673.0, 13.0, 13.6, "S"],
    ["Exp_W8_1", 40.0, 705.5, 14.0, 14.0, "N"], ["Exp_W8_2", 43.5, 726.0, 14.0, 14.0, "E"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide });

  // --- 4) 村东外扩翼（x = 223..256，隔 3.5m 曲折东外胡同 x≈218，土炮楼移至东北新角 [265, 498]）---
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_E1_1", 230.0, 509.0, 13.6, 13.6, "S"], ["Exp_E1_2", 245.5, 509.5, 13.6, 13.6, "S"],
    ["Exp_E2_1", 230.0, 535.5, 13.6, 13.6, "N"], ["Exp_E2_2", 245.5, 536.0, 13.6, 13.6, "N"],
    ["Exp_E3_1", 230.0, 555.5, 13.6, 13.6, "S"], ["Exp_E3_2", 245.5, 556.0, 13.6, 13.6, "S"],
    ["Exp_E4_1", 230.0, 586.5, 13.6, 13.6, "N"], ["Exp_E4_2", 245.5, 587.0, 13.6, 13.6, "N"],
    ["Exp_E5_1", 230.0, 606.5, 13.6, 13.6, "S"], ["Exp_E5_2", 245.5, 607.0, 13.6, 13.6, "S"],
    ["Exp_E6_1", 230.0, 626.5, 13.6, 13.6, "S"], ["Exp_E6_2", 245.5, 627.0, 13.6, 13.6, "S"],
    ["Exp_E7_1", 230.0, 656.5, 13.6, 13.6, "N"], ["Exp_E7_2", 245.5, 657.0, 13.6, 13.6, "N"],
    ["Exp_E8_1", 230.0, 695.0, 13.6, 13.6, "N"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide });

  // --- 5) 新增 +80m 村心南半部核心街区（z = 609..682，分三排由南中街 z=638、西胡同 x=84、南中心巷 x=121、主街 x=174 切分）---
  // 5A 北排（z=611..631，紧贴 SA1-SA3 南侧隔 3.5m 小巷，南临南中街 z=638）
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_SMN_1", 67.5, 621.5, 14.5, 15.6, "S"],
    ["Exp_SMN_2", 95.0, 621.5, 13.0, 15.6, "S"],
    ["Exp_SMN_3", 109.0, 621.5, 13.0, 15.6, "S"],
    ["Exp_SMN_4", 134.5, 621.5, 13.6, 15.6, "S"],
    ["Exp_SMN_5", 149.2, 621.5, 13.6, 15.6, "S"],
    ["Exp_SMN_6", 163.4, 621.5, 12.2, 15.2, "E"],
    ["Exp_SMN_7", 186.6, 622.0, 14.4, 15.2, "W"],
    ["Exp_SMN_8", 202.2, 622.0, 14.4, 15.2, "S"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide, yawDeg: 0 });
  // 5B 中排（z=644..658，北临南中街 z=638，南隔 3.5m 曲折窄巷 z=661）
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_SMM_1", 67.5, 651.2, 14.5, 13.2, "N"],
    ["Exp_SMM_2", 95.0, 651.2, 13.0, 13.2, "N"],
    ["Exp_SMM_3", 109.0, 651.2, 13.0, 13.2, "N"],
    ["Exp_SMM_4", 134.5, 651.2, 13.6, 13.2, "N"],
    ["Exp_SMM_5", 149.2, 651.2, 13.6, 13.2, "N"],
    ["Exp_SMM_6", 163.4, 651.2, 12.2, 13.0, "E"],
    ["Exp_SMM_7", 186.6, 652.0, 14.4, 13.0, "W"],
    ["Exp_SMM_8", 202.2, 652.0, 14.4, 13.0, "N"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide, yawDeg: 0 });
  // 5C 南排（z=665..679，南临南移后的南街 z=686..693，避开南移后的 GE1 z>=679）
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_SMS_1", 67.5, 672.5, 14.5, 13.2, "S"],
    ["Exp_SMS_2", 95.0, 672.5, 13.0, 13.2, "S"],
    ["Exp_SMS_3", 109.0, 672.5, 13.0, 13.2, "S"],
    ["Exp_SMS_4", 134.5, 672.5, 13.6, 13.2, "S"],
    ["Exp_SMS_5", 149.2, 672.5, 13.6, 13.2, "S"],
    ["Exp_SMS_6", 163.0, 671.5, 11.8, 12.2, "E"],
    ["Exp_SMS_7", 186.8, 669.5, 14.2, 10.6, "N"],
    ["Exp_SMS_8", 202.4, 670.5, 14.2, 11.6, "N"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide, yawDeg: 0 });

  // --- 6) 填实南移后救护所/田嫂家东西两侧空洞（z = 716..752，严守出村小路 x=121 与救护所门前空地 x=116..126）---
  for (const [id, cx, cz, w, d, gateSide] of [
    ["Exp_SE_1", 138.0, 723.5, 13.6, 13.0, "W"],
    ["Exp_SE_2", 153.5, 723.5, 13.6, 13.0, "N"],
    ["Exp_SE_3", 138.0, 742.0, 13.6, 13.0, "W"],
    ["Exp_SE_4", 154.0, 742.0, 14.0, 13.0, "S"],
    ["Exp_SW_1", 67.5, 724.0, 14.0, 13.0, "E"],
    ["Exp_SW_2", 67.5, 743.5, 14.0, 13.0, "S"],
  ]) AddLunanYard(id, cx, cz, w, d, { gateSide, yawDeg: 0 });

  // 鲁南田野乡土景物（随扩建后的村庄外缘 x<14 / x>270 / z<462 / z>875 重新落位，绝不侵入扩建民居与路径）：
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
  // 麦秸垛（分散在村西外场 x<12、村北麦田 z<460、村东外田 x>274 与南岸）
  for (const [idx, x, z, sc] of [
    [1, -6, 496, 1.05], [2, -2, 502, 0.85], [3, -8, 566, 1.1], [4, -4, 572, 0.82],
    [5, -8, 652, 1.0], [6, -24, 542, 0.95], [7, -42, 468, 1.05], [8, 62, 434, 0.9],
    [9, 168, 426, 1.1], [10, 173, 430, 0.82], [11, 282, 506, 1.0], [12, 286, 568, 0.95],
    [13, 288, 654, 1.05], [14, -22, 724, 0.9],
  ]) AddStrawRick(idx, x, z, sc);
  // 鲁南田间坟头与孤树
  for (const [idx, x, z, tree] of [
    [1, 72, 396, true], [2, 162, 382, true], [3, 194, 438, true], [4, 18, 442, true],
    [5, -26, 514, true], [6, -10, 614, true], [7, -54, 676, true], [8, 294, 488, true],
    [9, 296, 616, true], [10, -112, 560, true],
  ]) AddBurialMound(idx, x, z, tree);
  // 田间看青草棚与篱笆
  AddFieldHut(1, -12, 530, 8);
  AddFieldHut(2, 178, 450, -12);
  AddFieldHut(3, 292, 594, 4);
  AddFieldHut(4, -28, 704, 15);
  AddFieldFence(1, 12, 508, 7.5, 86);
  AddFieldFence(2, 12, 590, 8.2, 88);
  AddFieldFence(3, 274, 532, 7.0, 92);
  AddFieldFence(4, 156, 456, 8.0, 6);
  // 沿田埂与灌溉水沟成行的榆柳树排（严格避开扩建后的村界 x=20..268, z=490..758）
  for (const [idx, x, z, h] of [
    [1, 6, 368, 6.4], [2, 6, 398, 5.8], [3, 6, 430, 7.1], [4, 6, 492, 6.2],
    [5, 6, 534, 6.8], [6, 6, 586, 5.9], [7, 6, 646, 6.5], [8, 6, 706, 5.7],
    [9, -34, 404, 6.2], [10, -34, 454, 5.6], [11, -34, 524, 6.9], [12, -34, 608, 6.1],
    [13, -34, 696, 5.8], [14, 146, 366, 6.5], [15, 146, 404, 5.9], [16, 206, 376, 7.0],
    [17, 206, 422, 6.3], [18, 206, 458, 5.8], [19, 282, 492, 6.4], [20, 282, 548, 7.2],
    [21, 282, 616, 6.1], [22, 282, 684, 6.7], [23, -108, 440, 6.4], [24, -108, 625, 6.9],
    [25, -108, 748, 6.2], [26, -24, 902, 6.6], [27, 46, 914, 7.1], [28, 126, 908, 6.3],
  ]) {
    ownObjects.push({
      id: `Merged_FieldTree_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.45, h, 0.45], group: "08–13合并/田野/树排",
    });
  }

  // Transplant iconic regional landmarks into FirstLevelMerged:
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

  // 1) 关帝庙（兼村塾，25 件）：紧邻北街西段与西胡同（ΔX=-4.2, ΔZ=+99.5）
  for (const raw of baseDoc.objects) {
    if (!/^House_TempleHall|^Temple(Guandi|Incense|Dropped|Fallen|Altar|Desk|YardWest|HallWest)/.test(raw.id)) continue;
    Transplant(raw, -4.2, 99.5, "08–13合并/地标/关帝庙", "Merged_", (obj) => {
      if (raw.id === "TempleYardWestSouth") {
        obj.pos[2] = 534.8;
        obj.size = [0.5, 2.4, 6.8];
      }
    });
  }
  // 2) 官道旁小土地庙（10 件）：村口官道东侧 [109, 418]
  for (const raw of baseDoc.objects) {
    if (!/^RoadShrine/.test(raw.id)) continue;
    Transplant(raw, 0, -442, "08–13合并/地标/土地庙", "Merged_");
  }
  // 3) 村东北角高耸土炮楼（7.8m）：随东翼外扩迁至村东北新角 [265, 498]
  for (const raw of baseDoc.objects) {
    if (!/^WatchTower/.test(raw.id)) continue;
    Transplant(raw, 265 - 229.5, 498 - 390.5, "08–13合并/地标/土炮楼", "Merged_");
  }
  // 4) 村心大槐树（[132.5, 551.5]）与老石碾（[128, 553]）：位于主街/中街交汇广场，老耿家正门对面
  for (const raw of baseDoc.objects) {
    if (raw.id === "BigLocust") Transplant(raw, 132.5 - 121.5, 551.5 - 548.5, "08–13合并/地标/村心广场", "Merged_");
    if (raw.id === "MillBase" || raw.id === "MillStone") Transplant(raw, 128 - 77, 553 - 457, "08–13合并/地标/村心广场", "Merged_");
  }

  // Telegraph poles bridging north approach (z=365..455) AND the +80m expanded band (z=575..690)
  for (const [idx, zPos] of [375, 410, 445].entries()) {
    ownObjects.push({
      id: `Merged_TelePole_${idx + 1}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [-87, null, zPos], size: [0.24, 7.6, 0.24], group: "08–13合并/其他/Tele",
    });
  }
  const teleBridgeZs = [575, 613, 651, 690];
  for (let i = 1; i < teleBridgeZs.length - 1; i++) {
    const zp = teleBridgeZs[i];
    ownObjects.push(
      { id: `Merged_TelePole_Exp${i}`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-87, null, zp], size: [0.22, 7.0, 0.22], group: "08–13合并/其他/Tele" },
      { id: `Merged_TeleArm_Exp${i}`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-87, 6.8, zp], size: [1.4, 0.1, 0.1], group: "08–13合并/其他/Tele" },
    );
  }
  for (let i = 0; i < teleBridgeZs.length - 1; i++) {
    const za = teleBridgeZs[i], zb = teleBridgeZs[i + 1];
    ownObjects.push({
      id: `Merged_TeleWire_Exp${i + 1}`, asset: "Whitebox/Box", material: "Whitebox/Metal",
      pos: [-87, 6.8, Fix((za + zb) / 2)], size: [0.03, 0.03, Fix(zb - za - 0.22)], solid: false, group: "08–13合并/其他/Tele",
    });
  }

  // 战术低矮掩体（土坎/沙包/枕木垛）：d=0.50m + 双隐蔽点 cover.points（15 处：含南扩村街新增 2 处班长殿后沙袋）
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
    // 08d–09d 主街村心罗班长正面压制掩体（大槐树与石碾西侧沙袋垛）
    ["MainStBags", 130.2, 550.2, 3.8, 1.08, 0.50, 0, 1, 0],
    // 10a–10c 南中街/南街口班长殿后街垒掩体（贴街沿摆正，避开主街行车道）
    ["SouthMidBags", 170.6, 634.0, 3.2, 1.08, 0.50, 0, -1, 8],
    ["SouthStBags", 126.2, 688.8, 3.6, 1.08, 0.50, 0, -1, 0],
    // 12b 铁路路基截击组（MergedRailAmbush）枕木与道砟堆掩体（随南段 +80m）
    ["RailStones1", -72.8, 780.0, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    ["RailStones2", -76.5, 776.2, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    // 13b 桥北路基封锁机枪组（MergedBridgeGun）沙袋枕木阵位（+80m）
    ["BridgeGunBags", -73.2, 775.4, 3.6, 1.08, 0.50, 0, 1, 0],
    // 13b–13d 南岸河堤顺子与刘文财反击沙袋掩体（+80m）
    ["SouthBankBags", -89.8, 875.6, 4.4, 1.08, 0.50, 0, -1, 0],
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

  // Shift Beishahe trenches (north trench stays at z=477..492; RoadDitchNorthBank shifts +80m to z=773..823)
  const ownSegments = (baseDoc.trenches?.segments || [])
    .filter((seg) => seg.points.every((pt) => pt[1] >= SOURCE_START_Z))
    .map((seg) => {
      const south = seg.points.every((pt) => (pt[1] + DELTA_Z) >= SPLIT_Z);
      return {
        ...seg,
        group: seg.group?.replace(/^11–18\//, "08–13合并/") || seg.group,
        points: seg.points.map((pt) => [pt[0], MapZ(pt[1], south)]),
      };
    });

  // Shift Beishahe paint, ways, markers, backdrop paint
  const InSouth = (pts) => pts?.every((pt) => (Array.isArray(pt) ? pt[1] : pt.z) >= SOURCE_START_Z);
  const REBUILT_PAINT_IDS = new Set([
    "Village", "ThreshingFloor", "Road_MainStreet", "Road_NorthStreet",
    "Road_MidStreet", "Road_SouthStreet", "Road_WestLane", "Road_ExitPath",
  ]);
  const ShiftPaintEntry = (entry) => {
    const pts = entry.poly || entry.line || [];
    const avgZ = pts.length ? pts.reduce((a, p) => a + (Array.isArray(p) ? p[1] : p.z), 0) / pts.length : 0;
    const south = (avgZ + DELTA_Z) >= SPLIT_Z;
    const shifted = {
      ...entry,
      ...(entry.poly ? { poly: entry.poly.map((p) => ShiftPoint(p, south)) } : {}),
      ...(entry.line ? { line: entry.line.map((p) => ShiftPoint(p, south)) } : {}),
    };
    if (/^Garden_/.test(entry.id || "")) {
      shifted.color = "#a7ae84";
      shifted.strength = 0.38;
    } else if (entry.id === "Lizihang") {
      shifted.color = "#c6b99c";
      shifted.feather = 2.6;
    } else if (/^Road_|^GateYard$/.test(entry.id || "")) {
      shifted.color = "#e3dac2";
    }
    return shifted;
  };
  const ownPaint = (baseDoc.paint || [])
    .filter((e) => InSouth(e.poly || e.line) && !/^Wheat_/.test(e.id || "") && !REBUILT_PAINT_IDS.has(e.id || ""))
    .map(ShiftPaintEntry);

  // Expanded Beishahe ground base (~250m × 270m), tightened 17×15m Threshing Floor, continuous street & 3–4m hutong network,
  // and peripheral earthen field bunds pushed cleanly outside the expanded village boundary
  const mainStreetPts = [
    { x: 99, z: 475 }, { x: 114, z: 520 }, { x: 140, z: 560 }, { x: 170, z: 600 },
    { x: 174, z: 638 }, { x: 172, z: 680 }, { x: 205, z: 720 }, { x: 240, z: 756 }, { x: 246, z: 754 },
  ];
  const northStreetPts = [
    { x: 22, z: 516 }, { x: 60, z: 516 }, { x: 90, z: 516 }, { x: 114, z: 520 },
    { x: 145, z: 521 }, { x: 175, z: 518 }, { x: 212, z: 523 }, { x: 256, z: 524 },
  ];
  const midStreetPts = [
    { x: 22, z: 563 }, { x: 56, z: 563 }, { x: 84, z: 561 }, { x: 122, z: 558 },
    { x: 140, z: 560 }, { x: 157, z: 564 }, { x: 185, z: 569 }, { x: 216, z: 572 }, { x: 258, z: 573 },
  ];
  const southMidStreetPts = [
    { x: 24, z: 638 }, { x: 52, z: 638 }, { x: 84, z: 636 }, { x: 121, z: 636 },
    { x: 174, z: 638 }, { x: 218, z: 642 }, { x: 256, z: 643 },
  ];
  const southStreetPts = [
    { x: 28, z: 690 }, { x: 66, z: 690 }, { x: 96, z: 687 }, { x: 121, z: 693 },
    { x: 146, z: 687 }, { x: 172, z: 680 }, { x: 200, z: 678 }, { x: 252, z: 682 },
  ];
  const westOuterLanePts = [
    { x: 51, z: 500 }, { x: 51, z: 516 }, { x: 51, z: 563 }, { x: 51, z: 608 },
    { x: 52, z: 638 }, { x: 55, z: 690 }, { x: 55, z: 736 },
  ];
  const westLanePts = [
    { x: 90, z: 516 }, { x: 86, z: 538 }, { x: 84, z: 561 }, { x: 80, z: 586 },
    { x: 84, z: 608 }, { x: 84, z: 636 }, { x: 84, z: 688 },
  ];
  const eastOuterLanePts = [
    { x: 218, z: 504 }, { x: 218, z: 523 }, { x: 218, z: 572 }, { x: 218, z: 614 },
    { x: 218, z: 642 }, { x: 218, z: 682 },
  ];
  const exitPathPts = [
    { x: 121, z: 613 }, { x: 121, z: 636 }, { x: 121, z: 693 }, { x: 121, z: 732 }, { x: 121, z: 755 },
  ];
  const midSouthHutongPts = [
    { x: 52, z: 661.5 }, { x: 84, z: 661.5 }, { x: 121, z: 661.5 }, { x: 174, z: 661.5 }, { x: 218, z: 661.5 },
  ];

  ownPaint.unshift(
    {
      id: "Village",
      poly: [
        { x: 19, z: 496 }, { x: 96, z: 486 }, { x: 154, z: 484 }, { x: 216, z: 488 }, { x: 268, z: 494 },
        { x: 266, z: 684 }, { x: 242, z: 736 }, { x: 204, z: 744 }, { x: 168, z: 754 },
        { x: 124, z: 756 }, { x: 54, z: 754 }, { x: 30, z: 726 }, { x: 20, z: 664 }, { x: 18, z: 572 },
      ],
      feather: 2.8, color: "#c6b99c",
    },
    {
      id: "ThreshingFloor",
      poly: [
        { x: 97, z: 540 }, { x: 100, z: 533 }, { x: 106, z: 532 }, { x: 113, z: 533 },
        { x: 115, z: 540 }, { x: 113, z: 546 }, { x: 106, z: 547 }, { x: 100, z: 546 },
      ],
      feather: 2.0, color: "#d8cb9f",
    },
    {
      id: "MergedConnectRoad",
      line: [{ x: 99, z: 355 }, { x: 103, z: 392 }, { x: 103.5, z: 418 }, { x: 102, z: 440 }, { x: 99, z: 467 }],
      halfW: 2.6, feather: 0.8, color: "#dfd5bc",
    },
    { id: "Road_MainStreet", line: mainStreetPts, halfW: 2.2, feather: 0.7, color: "#e3dac2" },
    { id: "Road_NorthStreet", line: northStreetPts, halfW: 1.6, feather: 0.6, color: "#e3dac2" },
    { id: "Road_MidStreet", line: midStreetPts, halfW: 1.8, feather: 0.6, color: "#e3dac2" },
    { id: "Road_SouthMidStreet", line: southMidStreetPts, halfW: 1.6, feather: 0.6, color: "#e3dac2" },
    { id: "Road_SouthStreet", line: southStreetPts, halfW: 1.6, feather: 0.6, color: "#e3dac2" },
    { id: "Road_WestOuterLane", line: westOuterLanePts, halfW: 1.25, feather: 0.5, color: "#e3dac2" },
    { id: "Road_WestLane", line: westLanePts, halfW: 1.25, feather: 0.5, color: "#e3dac2" },
    { id: "Road_EastOuterLane", line: eastOuterLanePts, halfW: 1.25, feather: 0.5, color: "#e3dac2" },
    { id: "Road_MidSouthHutong", line: midSouthHutongPts, halfW: 1.1, feather: 0.45, color: "#e3dac2" },
    { id: "Road_ExitPath", line: exitPathPts, halfW: 1.5, feather: 0.6, color: "#e3dac2" },
    // Field bunds cleanly outside expanded village (x < 14, x > 274, z < 466)
    { id: "FieldBund_W1", line: [{ x: 6, z: 355 }, { x: 6, z: 758 }], halfW: 0.55, feather: 0.35, color: "#baa886", strength: 0.72 },
    { id: "FieldBund_W2", line: [{ x: -34, z: 355 }, { x: -34, z: 756 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH1", line: [{ x: -74, z: 462 }, { x: 14, z: 462 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH2", line: [{ x: -74, z: 540 }, { x: 14, z: 540 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH3", line: [{ x: -74, z: 622 }, { x: 14, z: 622 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_WH4", line: [{ x: -74, z: 702 }, { x: 14, z: 702 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_N1", line: [{ x: 146, z: 355 }, { x: 146, z: 466 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_N2", line: [{ x: 206, z: 355 }, { x: 206, z: 466 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_E1", line: [{ x: 282, z: 466 }, { x: 282, z: 762 }], halfW: 0.55, feather: 0.35, color: "#baa886", strength: 0.72 },
    { id: "FieldBund_EH1", line: [{ x: 270, z: 542 }, { x: 318, z: 542 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_EH2", line: [{ x: 270, z: 622 }, { x: 318, z: 622 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
    { id: "FieldBund_EH3", line: [{ x: 270, z: 702 }, { x: 318, z: 702 }], halfW: 0.5, feather: 0.35, color: "#baa886", strength: 0.7 },
  );

  // Build updated ways.roads (replace the 6 expanded/stretched village roads, keep shifted south/north/side lanes)
  const ownRoads = [
    [{ x: 98.5, z: 344 }, { x: 99, z: 355 }, { x: 103, z: 392 }, { x: 103.5, z: 418 }, { x: 102, z: 440 }, { x: 99, z: 467 }],
    [{ x: 99, z: 467 }, { x: 99, z: 475 }],
    mainStreetPts,
    northStreetPts,
    midStreetPts,
    southMidStreetPts,
    southStreetPts,
    westOuterLanePts,
    westLanePts,
    eastOuterLanePts,
    midSouthHutongPts,
    exitPathPts,
    [{ x: 145, z: 521 }, { x: 152, z: 540 }, { x: 157, z: 564 }],
    [{ x: 185, z: 569 }, { x: 190, z: 586 }, { x: 188, z: 601 }],
    [{ x: 175, z: 518 }, { x: 178, z: 498 }],
    [{ x: 84, z: 561 }, { x: 68, z: 544 }],
    // Shifted south roads (+80m)
    ...((baseDoc.ways?.roads || [])
      .filter((line) => line.every((pt) => ((pt.z ?? pt[1]) + DELTA_Z) >= 665))
      .map((line) => line.map((pt) => ShiftPoint(pt, true)))),
  ];
  const ownWayTrenches = (baseDoc.ways?.trenches || [])
    .filter((line) => line.every((pt) => (pt.z ?? pt[1]) >= SOURCE_START_Z))
    .map((line) => {
      const south = line.every((pt) => ((pt.z ?? pt[1]) + DELTA_Z) >= SPLIT_Z);
      return line.map((pt) => ShiftPoint(pt, south));
    });

  const ownMarkers = [
    ...(baseDoc.markers || [])
      .filter((m) => m.z >= SOURCE_START_Z)
      .map((m) => {
        if (m.id === "LmVillage") {
          return {
            ...m, x: 143, z: 622, w: 250, d: 270,
            note: "鲁南百户大村（官道斜穿主街；北街/中街/南中街/南街与多条3–4m曲折胡同）",
          };
        }
        if (m.id === "LmThreshing") {
          return { ...m, x: 106, z: 540, w: 17, d: 15 };
        }
        if (m.id === "LmSouthStreet") return { ...m, x: 108, z: 690 };
        if (m.id === "LmSouthStreetCorner") return { ...m, x: 172, z: 680 };
        if (m.id === "LmExitPath") return { ...m, x: 121, z: 744 };
        const forceSouth = m.id === "LmWell_3" ? true : null;
        return { ...m, z: MapZ(m.z, forceSouth) };
      }),
    { id: "LmMergedSouthMidStreet", name: "南中街（民居密巷）", x: 142.0, z: 638.0, kind: "place" },
    { id: "LmMergedTemple", name: "关帝庙（兼村塾）", x: 80.3, z: 526.5, kind: "place" },
    { id: "LmMergedRoadShrine", name: "小土地庙", x: 109.0, z: 418.0, kind: "place" },
    { id: "LmMergedWatchTower", name: "土炮楼", x: 265.0, z: 498.0, kind: "place" },
    { id: "LmMergedBigLocust", name: "大槐树", x: 132.5, z: 551.5, kind: "place" },
    { id: "LmMergedMill", name: "石碾", x: 128.0, z: 553.0, kind: "place" },
    { id: "LmMergedGengYard", name: "老耿家（中街西头）", x: 131.6, z: 569.5, kind: "place" },
    { id: "LmMergedSideGate", name: "夹壁便门", x: 125.1, z: 564.8, kind: "place" },
  ];

  const maxZ = INHERIT_MAX_Z + outRows * cellM; // 990
  const mergedDoc = {
    schema: "tengxian-scene/1",
    id: "FirstLevelMerged",
    title: "第一关 · 北沙河单村合并版",
    inherit: { scene: "FirstLevelEncounter", maxZ: INHERIT_MAX_Z },
    source: {
      inheritedNorthFrom: "FirstLevelEncounter",
      inheritMaxZ: INHERIT_MAX_Z,
      beishaheShiftZ: DELTA_Z,
      villageExpandZ: EXPAND_Z,
      villageSplitZ: SPLIT_Z,
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
        name: "北沙河黄昏（田嫂家出村 z720 起转落日向西赶桥）",
        shape: "box",
        center: [80, 0, 855],
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
    `Built FirstLevelMerged (Plan A expanded): southRows=${outRows}, southObjects=${ownObjects.length}, `
    + `resolvedRows=${resolved.doc.terrain.rows}, resolvedObjects=${resolved.doc.objects.length}, maxZ=${maxZ}`,
  );
}

BuildMergedScene();
