// 贴图资产规范门禁（纯 Node，零 three，百毫秒级）。口径：docs/Data_TextureAssetStandard.md。
//
// 管的事：
//   1. Texture/ 下每个文件 ↔ Data_TextureManifest 一一对应（没登记的、登记了却不存在的都红），尺寸与文件头一致；
//   2. 命名、格式、2 的幂、尺寸上限、套件完整（Base 必有 Normal + Orm|Orh，或 ormFrom / albedoOnly）；
//   3. 非 legacy 条目：来源（provider / date / 生成类要提示词文件 / 下载类要 license）、消费方文件里真的出现 token、
//      material / terrainLayer 的烘焙记录（sha256 对得上磁盘、平铺与定色指标过 Data_TextureBakePresets 的门槛）；
//   4. 体积：非 legacy 每套 ≤ 1 MB / 单张 ≤ 600 KB，各加载层整层上限，全目录上限；
//   5. 加载层：tier=boot 的文件 = Script_Main.PBR_SETS 的文件；关卡按需集（Data_LevelTextureSets）的
//      文件、戳、预算、可退回材质，以及 LoadLevelTextureSets 的行为（替身 library 驱动）；
//   6. 运行时源码里的贴图 URL：指向的文件必须存在；没有 ?v= 戳的只能是冻结名单里的（只许变短）；
//   7. legacy 名单冻结在本文件（LEGACY_IDS），**只许变短**：新条目不许以 legacy 身份进来。
//
// 用法：node Taierzhuang1938/Script_TextureStandardsTest.mjs [--verbose]

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEXTURE_MANIFEST, TEXTURE_CHANNELS, TEXTURE_KINDS, TEXTURE_TIERS, TEXTURE_PROVIDERS, TEXTURE_BUDGETS,
} from "./Data_TextureManifest.mjs";
import {
  LEVEL_TEXTURE_SETS, LEVEL_TEXTURE_BUDGET_BYTES, LEVEL_SET_BUDGET_BYTES, LevelTextureSetUrls,
} from "./Data_LevelTextureSets.mjs";
import { LoadLevelTextureSets } from "./Script_LevelTextureSets.mjs";
import { RECIPES } from "./Script_TexBake.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const textureDir = path.join(project, "Texture");
const verbose = process.argv.includes("--verbose");
const presets = JSON.parse(fs.readFileSync(path.join(project, "_import", "Data_TextureBakePresets.json"), "utf8"));

// ---------------------------------------------------------------------------------------------------
// 冻结名单
// ---------------------------------------------------------------------------------------------------
// legacy 条目（2026-09-28 首次登记）。**只许变短**：某套规范化了（或删了）就把它从这里删掉；
// 不许为了让新贴图过门禁往这里加名字 —— 新贴图必须按规范来。
const LEGACY_IDS = new Set([
  "WeaponSteelV2", "WeaponWoodV2", "Type89", "Grenade", "HandcartWood", "WoodCrate",
  "TreeBark", "BrickWall", "CityWallBrick", "CityWallCore", "CityWallStone", "CraterScorched",
  "MissionSoil", "PloughedSoil", "Ground", "RoofTile", "GateBrick", "GatePaintedWood",
  "GateRoofTile", "Sandbag", "WattleFence", "BrickWallSooty", "BuildingDamageEarly", "BuildingDamageSevere",
  "Adobe", "Stone", "WellStone", "Millstone", "WaterVat", "StationBrick",
  "PrisonBrick", "TemplePlaster", "CarriageBenchWood", "CarriageFloorSteel", "CarriageCeilingSteel", "Lugouqiao",
  "TrenchStone", "TrenchRootMat", "TrenchMudHeight", "BunkerPoster", "ShopDoorPbr",
  "NraUniformClothDetail", "RuralHouse", "IncomingMarker", "BulletImpactPbrAtlas", "BloodSplatter", "HudMeleeKillBlood",
  "GrenadeReticleIcon", "GrenadeWarningIcon", "SettingsToolsIcon", "MissionMenuArt", "OrchestrationIcons", "OxCartPbr",
  "PaperProps", "PaperPropsTool", "BunkerPosterTool",
]);

// 运行时源码里写死、没带 ?v= 戳的贴图 URL（"文件|URL"，2026-09-28 首次登记）。**只许变短**：
// 补上戳（改图就改戳，否则线上玩家拿到缓存旧图）就把那一行删掉。
const UNSTAMPED_PENDING = new Set([
  ...["ZhongZheng", "HanYang", "Type38", "Zb26", "Type11", "ServicePistol", "Dadao"]
    .map((id) => `Data_HudWeaponIcons.mjs|Texture/Hud/Texture_HudWeapon_${id}.png`),
  "Data_OpeningSet0103.mjs|Texture/Texture_BunkerPosterDefendShandong.webp",
  ...["Rifleman", "MachineGunner", "Bayonet", "Tank", "Reserve", "Dormant", "Cleared", "Hold", "FriendlySquad",
    "GuardPost", "Defender", "ForwardNest", "Player", "Stretcher", "Cart", "Aircraft", "Supply", "Gate", "Anchor",
    "Zone", "Route", "Wave", "Note"].map((id) => `Data_OrchestrationIcons.mjs|Texture/Editor/Icon_Orch_${id}.png`),
  "Data_Tuning_FirearmHandling.mjs|Texture/Texture_VefectsFireMask_01.webp",
  "Script_TzmShot.mjs|Texture/Texture_Type89Orm.webp",
  ...["VefectsFireMask_01", "VefectsGroundFireMask_01", "VefectsSmokeMask_01", "VefectsNoise_03", "VefectsNoise_08",
    "IncomingMarker_01", "BulletImpactPbrAtlasBase", "BulletImpactPbrAtlasNormal", "BulletImpactPbrAtlasOrm",
    "ExplosionUnityCompact_01", "ExplosionUnityFireBall_02", "ExplosionUnityHeavy_02"]
    .map((stem) => `Script_Vfx.mjs|Texture/Texture_${stem}.webp`),
  "Style_Game.css|Texture/Icon_GrenadeReticle.png",
]);
// 字面量没带戳、但加载器运行时统一拼 `?v=` 的（读过加载器代码确认过）：
// Script_TrenchSurface.LoadTrenchSurface 的 Fetch 与 Script_FirstLevelWhiteboxField 的 VersionedLayer 都拼 `?v=${TRENCH_SURFACE.version}`。
const STAMPED_BY_LOADER = new Set([
  ...["TrenchPomBase.webp", "TrenchPomNormal.webp", "TrenchPomOrh.webp", "TrenchStoneBase.webp", "TrenchStoneNormal.webp",
    "TrenchStoneOrm.webp", "TrenchMudHeightMask.png", "TrenchRootMat.webp"].map((f) => `Data_TrenchSurface.mjs|Texture/Texture_${f}`),
]);

// ---------------------------------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------------------------------
const failures = [];
let checks = 0;
function Check(ok, label, detail = "") {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ""}`);
  else if (verbose) console.log(`ok   ${label}`);
}
function Section(title) { console.log(`--- ${title}`); }
const KB = (b) => `${(b / 1024).toFixed(0)} KB`;
const MB = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;
const IsPow2 = (n) => n > 0 && (n & (n - 1)) === 0;

/** 读图片头拿尺寸（webp / png / jpg / hdr），不解码。 */
function ImageSize(file) {
  const b = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === ".webp") {
    if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") throw new Error("不是 WebP");
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === "VP8L") { const bits = b.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
    if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    throw new Error(`未知 WebP 块 ${chunk}`);
  }
  if (ext === ".png") {
    if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG");
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
    throw new Error("JPEG 没有 SOF");
  }
  if (ext === ".hdr") {
    const head = b.toString("latin1", 0, Math.min(b.length, 4096));
    const m = head.match(/\n-Y (\d+) \+X (\d+)\n/);
    if (!m) throw new Error("HDR 头没有分辨率行");
    return [Number(m[2]), Number(m[1])];
  }
  return [0, 0];
}
const IMAGE_EXT = /\.(webp|png|jpe?g|hdr)$/i;

function WalkTexture(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...WalkTexture(path.join(dir, e.name), r));
    else out.push(r);
  }
  return out;
}
const Sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ProjectPath = (p) => path.join(project, p.split("#")[0]);
const IsRepoPath = (p) => typeof p === "string" && /^(_import|_blender|docs|Texture|Script_|Data_)/.test(p);

// ---------------------------------------------------------------------------------------------------
// 1. 清单结构 + 磁盘一一对应 + 尺寸
// ---------------------------------------------------------------------------------------------------
Section("清单 ↔ 磁盘");
const byFile = new Map();
const ids = new Set();
for (const entry of TEXTURE_MANIFEST) {
  Check(typeof entry.id === "string" && /^[A-Z][A-Za-z0-9]*$/.test(entry.id), `id 是 PascalCase：${entry.id}`);
  Check(!ids.has(entry.id), `id 不重复：${entry.id}`);
  ids.add(entry.id);
  Check(entry.kind in TEXTURE_KINDS, `${entry.id}: kind ${entry.kind} 已定义`);
  Check(entry.tier in TEXTURE_TIERS || /^level:[A-Z][A-Za-z0-9]*$/.test(entry.tier), `${entry.id}: tier ${entry.tier} 已定义`);
  Check(Array.isArray(entry.files) && entry.files.length > 0, `${entry.id}: files 非空`);
  for (const f of entry.files) {
    const [rel, channel, w, h] = f;
    Check(!byFile.has(rel), `文件只登记一次：${rel}`, byFile.has(rel) ? `（已在 ${byFile.get(rel).entry.id}）` : "");
    Check(channel in TEXTURE_CHANNELS, `${rel}: 通道 ${channel} 已定义`);
    byFile.set(rel, { entry, channel, w, h });
  }
}
const disk = WalkTexture(textureDir);
const unregistered = disk.filter((f) => !byFile.has(f));
const missing = [...byFile.keys()].filter((f) => !fs.existsSync(path.join(textureDir, f)));
Check(unregistered.length === 0, "Texture/ 下每个文件都已登记", unregistered.join("、"));
Check(missing.length === 0, "登记的文件都存在", missing.join("、"));
const bytesOf = new Map();
for (const [rel, info] of byFile) {
  const file = path.join(textureDir, rel);
  if (!fs.existsSync(file)) continue;
  bytesOf.set(rel, fs.statSync(file).size);
  if (!IMAGE_EXT.test(rel)) continue;
  let size = [0, 0];
  try { size = ImageSize(file); } catch (error) { Check(false, `${rel}: 文件头可读`, String(error.message)); continue; }
  Check(size[0] === info.w && size[1] === info.h, `${rel}: 登记尺寸与文件一致`, `登记 ${info.w}×${info.h}，实际 ${size[0]}×${size[1]}`);
}
console.log(`     ${TEXTURE_MANIFEST.length} 套 / ${byFile.size} 个文件，磁盘 ${disk.length} 个`);

// ---------------------------------------------------------------------------------------------------
// 2. 命名 / 格式 / 尺寸 / 完整性
// ---------------------------------------------------------------------------------------------------
Section("命名、格式、尺寸、套件完整");
const PBR_KINDS = new Set(["material", "terrainLayer"]);
const POW2_KINDS = new Set(["material", "terrainLayer", "decal", "vfx", "detail"]);
const NAME_RULES = {
  flat: /^Texture_[A-Z][A-Za-z0-9]*(_\d{2})?\.webp$/,
  ui: /^Texture_[A-Z][A-Za-z0-9]*(_[A-Z0-9][A-Za-z0-9]*)*\.(webp|png)$/,
  icon: /^Icon_[A-Z][A-Za-z0-9]*(_[A-Z0-9][A-Za-z0-9]*)*\.(webp|png)$/,
  environment: /^Texture_[A-Z][A-Za-z0-9]*(_[A-Za-z0-9]+)*\.hdr$/,
  doc: /^Data_[A-Z][A-Za-z0-9]*\.md$/,
};
for (const entry of TEXTURE_MANIFEST) {
  const channels = new Set(entry.files.map((f) => f[1]));
  // 套件完整：所有 material / terrainLayer（legacy 也一样）—— 缺了 ORM 的一套在运行时就是没有粗糙度。
  if (PBR_KINDS.has(entry.kind) && channels.has("Base") && !entry.albedoOnly) {
    Check(channels.has("Normal"), `${entry.id}: 有 Base 就要有 Normal`);
    Check(channels.has("Orm") || channels.has("Orh") || !!entry.ormFrom, `${entry.id}: 有 Base 就要有 Orm|Orh（或写 ormFrom）`);
  }
  if (entry.legacy) continue;
  Check(!["bakeInput", "tool"].includes(entry.kind), `${entry.id}: ${entry.kind} 只能是 legacy（不该放在 Texture/）`);
  const base = entry.files.find((f) => f[1] === "Base");
  for (const [rel, channel, w, h] of entry.files) {
    const name = path.posix.basename(rel);
    const bytes = bytesOf.get(rel) || 0;
    if (PBR_KINDS.has(entry.kind)) {
      Check(name === `Texture_${entry.id}${channel}.webp`, `${rel}: 命名 = Texture_${entry.id}${channel}.webp`);
      Check(["Base", "Normal", "Orm", "Orh", "Mask"].includes(channel), `${rel}: PBR 套只用 Base/Normal/Orm/Orh/Mask`);
      Check(w === h, `${rel}: 正方形`);
      Check(w <= (entry.sizeReason ? 2048 : 1024), `${rel}: 边长 ≤ 1024（2048 须写 sizeReason）`, `${w}`);
      if (base && channel !== "Base") Check(w <= base[2], `${rel}: 数据图不大于 Base`, `${w} > ${base[2]}`);
      if (entry.kind === "terrainLayer") Check(channel !== "Orm", `${rel}: 地形层打包用 Orh`);
    } else if (["decal", "vfx", "detail"].includes(entry.kind)) {
      Check(NAME_RULES.flat.test(name) || name === `Texture_${entry.id}${channel}.webp`, `${rel}: 命名 Texture_<PascalCase>[<通道>][_NN].webp`);
      Check(Math.max(w, h) <= (entry.sizeReason ? 2048 : 1024), `${rel}: 边长 ≤ 1024（2048 须写 sizeReason）`);
    } else if (entry.kind === "print" || entry.kind === "hud" || entry.kind === "menu") {
      Check(NAME_RULES.ui.test(name), `${rel}: 命名 Texture_<PascalCase>[_<Variant>].webp|png`);
      Check(Math.max(w, h) <= 2048, `${rel}: 边长 ≤ 2048`);
    } else if (entry.kind === "icon") {
      Check(NAME_RULES.icon.test(name), `${rel}: 命名 Icon_<PascalCase>[_<Name>].webp|png`);
      Check(Math.max(w, h) <= 512, `${rel}: 图标边长 ≤ 512`);
    } else if (entry.kind === "environment") {
      Check(NAME_RULES.environment.test(name), `${rel}: 环境图命名 Texture_<PascalCase>[_<Res>].hdr`);
    } else if (entry.kind === "doc") {
      Check(NAME_RULES.doc.test(name), `${rel}: 说明命名 Data_<PascalCase>.md`);
    }
    if (POW2_KINDS.has(entry.kind)) Check(IsPow2(w) && IsPow2(h), `${rel}: 2 的幂`, `${w}×${h}`);
    if (entry.kind === "hud") Check(rel.startsWith("Hud/"), `${rel}: HUD 图放 Texture/Hud/`);
    if (entry.kind === "menu") Check(rel.startsWith("Menu/"), `${rel}: 菜单图放 Texture/Menu/`);
    if (/\.png$/i.test(name)) Check(["hud", "icon", "menu"].includes(entry.kind) && bytes <= TEXTURE_BUDGETS.pngMaxBytes,
      `${rel}: PNG 只许 ≤ ${KB(TEXTURE_BUDGETS.pngMaxBytes)} 的图标 / HUD 小图`, `${entry.kind} ${KB(bytes)}`);
    if (/\.jpe?g$/i.test(name)) Check(false, `${rel}: 不许 JPEG（有损法线 / 无 alpha），转 webp`);
  }
}

// ---------------------------------------------------------------------------------------------------
// 3. 来源 / 消费方 / 烘焙脚本
// ---------------------------------------------------------------------------------------------------
Section("来源、消费方、烘焙记录");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const referencedPrompts = new Set();
const referencedRecords = new Set();
for (const entry of TEXTURE_MANIFEST) {
  const src = entry.source;
  if (entry.kind !== "doc") {
    Check(src && (src.provider in TEXTURE_PROVIDERS || (entry.legacy && src.provider === "unknown")),
      `${entry.id}: source.provider 已定义`, src?.provider);
    Check(src && DATE.test(src.date || ""), `${entry.id}: source.date 是 YYYY-MM-DD`, src?.date);
  }
  if (src?.prompt) {
    referencedPrompts.add(src.prompt.split("#")[0]);
    Check(fs.existsSync(ProjectPath(src.prompt)), `${entry.id}: 提示词记录存在`, src.prompt);
  }
  if (entry.bake && IsRepoPath(entry.bake)) Check(fs.existsSync(ProjectPath(entry.bake)), `${entry.id}: 烘焙脚本存在`, entry.bake);
  if (entry.legacy) {
    Check(typeof entry.legacy === "string" && entry.legacy.length >= 4, `${entry.id}: legacy 写明理由`);
  } else if (entry.kind !== "doc") {
    const provider = TEXTURE_PROVIDERS[src?.provider];
    if (provider?.generative) {
      Check(!!src.prompt, `${entry.id}: 生成类来源必须有提示词记录（_import/Prompts/Texture_<id>.txt 或文档路径）`);
      if (src.provider === "lovart") Check(!!src.ref, `${entry.id}: Lovart 来源要写 thread id（source.ref）`);
    } else if (src?.provider === "procedural") {
      Check(!!(src.ref || entry.bake), `${entry.id}: 程序生成要写脚本（source.ref 或 bake）`);
    } else {
      Check(!!src?.license && !!src?.ref, `${entry.id}: 下载 / 素材包来源要写 license 与 ref`);
    }
  }
  // 消费方：非 offline 的必须有；写了的都要在文件里真出现 token。
  if (entry.tier !== "offline" && !entry.legacy) Check(entry.consumers?.length > 0, `${entry.id}: 至少一个消费方`);
  for (const c of entry.consumers || []) {
    const file = path.join(project, c.file);
    const ok = fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(c.token);
    Check(ok, `${entry.id}: 消费方 ${c.file} 里出现 ${c.token}`);
  }
  // 烘焙记录：非 legacy 的 material / terrainLayer 必须有，且与磁盘逐字节对得上。
  if (entry.bakeRecord) referencedRecords.add(entry.bakeRecord);
  if (!entry.legacy && PBR_KINDS.has(entry.kind)) {
    Check(!!entry.bakeRecord, `${entry.id}: 非 legacy 的 PBR 套要有 bakeRecord（Script_BakePbrTexture 写 / --audit 量）`);
    if (entry.toneClass === null || entry.toneClass === undefined) Check(!!entry.toneReason, `${entry.id}: 没有 toneClass 就要写 toneReason`);
    else Check(entry.toneClass in presets.classes, `${entry.id}: toneClass ${entry.toneClass} 在预设里`);
    Check(entry.metersPerTile === null || (typeof entry.metersPerTile === "number" && entry.metersPerTile > 0),
      `${entry.id}: metersPerTile 是正数或 null（UV 图集）`);
  }
  if (entry.bakeRecord) CheckBakeRecord(entry);
}
function CheckBakeRecord(entry) {
  const file = ProjectPath(entry.bakeRecord);
  if (!fs.existsSync(file)) { Check(false, `${entry.id}: 烘焙记录存在`, entry.bakeRecord); return; }
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  const recFiles = new Map(rec.outputs.map((o) => [o.file, o]));
  const entryFiles = entry.files.map((f) => path.posix.basename(f[0]));
  Check(entryFiles.length === recFiles.size && entryFiles.every((f) => recFiles.has(f)),
    `${entry.id}: 记录的产物与清单文件一致`, `${[...recFiles.keys()].join(",")} vs ${entryFiles.join(",")}`);
  for (const [rel, , w, h] of entry.files) {
    const o = recFiles.get(path.posix.basename(rel));
    if (!o) continue;
    const abs = path.join(textureDir, rel);
    if (!fs.existsSync(abs)) continue;
    Check(o.sha256 === Sha256(abs), `${rel}: 与烘焙记录 sha256 一致（换了图就重烘 / 重新 --audit 并更新清单）`);
    Check(o.width === w && o.height === h, `${rel}: 记录尺寸一致`);
  }
  const m = rec.metrics, g = presets.gates;
  if (typeof entry.metersPerTile === "number") {
    if (rec.params?.tileM != null) Check(Math.abs(rec.params.tileM - entry.metersPerTile) < 1e-6, `${entry.id}: 记录 tileM = 清单 metersPerTile`, `${rec.params.tileM} vs ${entry.metersPerTile}`);
    const texels = entry.files.find((f) => f[1] === "Base")[2] / entry.metersPerTile;
    Check(texels >= g.texelsPerMeter[0] && texels <= g.texelsPerMeter[1], `${entry.id}: 纹素密度 ${texels.toFixed(0)} px/m 在 [${g.texelsPerMeter}]`);
    Check(m.seamRatio <= g.seamRatioMax, `${entry.id}: seamRatio ${m.seamRatio} ≤ ${g.seamRatioMax}`);
    const cls = presets.classes[entry.toneClass];
    if (!cls || cls.isotropic !== false) {
      Check(m.border >= g.borderMin, `${entry.id}: border ${m.border} ≥ ${g.borderMin}`);
      Check(m.swing <= g.swingMax, `${entry.id}: swing ${m.swing} ≤ ${g.swingMax}`);
    }
  }
  if ((entry.normalConvention || "gl") !== (rec.params?.normalConvention || "gl")) Check(false, `${entry.id}: 法线约定与记录一致`);
  if (entry.toneClass && presets.classes[entry.toneClass]) {
    const cls = presets.classes[entry.toneClass];
    const In = (v, [lo, hi]) => v >= lo - 1e-9 && v <= hi + 1e-9;
    Check(In(m.luma, cls.lumaRange), `${entry.id}: 亮度 ${m.luma} 在 ${entry.toneClass} ${JSON.stringify(cls.lumaRange)}`);
    Check(In(m.sat, cls.satRange), `${entry.id}: 饱和 ${m.sat} 在 ${JSON.stringify(cls.satRange)}`);
    Check(In(m.lumaStd, cls.stdRange), `${entry.id}: 亮度标准差 ${m.lumaStd} 在 ${JSON.stringify(cls.stdRange)}`);
    Check(m.clipLow <= g.clipLowMax && m.clipHigh <= g.clipHighMax, `${entry.id}: 暗部 / 高光堆积 ≤ 2%`, `${m.clipLow}/${m.clipHigh}`);
    Check(m.lowFreq <= g.lowFreqMax, `${entry.id}: lowFreq ${m.lowFreq} ≤ ${g.lowFreqMax}（烘进去的大块光影）`);
  }
}
// 仓库里的提示词与烘焙记录不许成为孤儿。
for (const dir of ["_import/Prompts", "_import/TextureBakes"]) {
  const abs = path.join(project, dir);
  if (!fs.existsSync(abs)) continue;
  const used = dir.endsWith("Prompts") ? referencedPrompts : referencedRecords;
  for (const f of fs.readdirSync(abs)) Check(used.has(`${dir}/${f}`), `${dir}/${f} 被清单引用（孤儿记录删掉或登记）`);
}

// ---------------------------------------------------------------------------------------------------
// 4. 体积
// ---------------------------------------------------------------------------------------------------
Section("体积预算");
const tierBytes = {};
let total = 0;
for (const entry of TEXTURE_MANIFEST) {
  let setBytes = 0;
  for (const [rel, channel] of entry.files) {
    const b = bytesOf.get(rel) || 0;
    setBytes += b;
    total += b;
    tierBytes[entry.tier] = (tierBytes[entry.tier] || 0) + b;
    if (entry.legacy || entry.budgetReason) continue;
    if (PBR_KINDS.has(entry.kind) && ["Base", "Normal", "Orm", "Orh"].includes(channel))
      Check(b <= TEXTURE_BUDGETS.singleBytes, `${rel}: 单张 ${KB(b)} ≤ ${KB(TEXTURE_BUDGETS.singleBytes)}`);
    if (["vfx", "decal", "detail"].includes(entry.kind)) Check(b <= TEXTURE_BUDGETS.vfxSingleBytes, `${rel}: 单张 ${KB(b)} ≤ ${KB(TEXTURE_BUDGETS.vfxSingleBytes)}`);
  }
  if (!entry.legacy && !entry.budgetReason && PBR_KINDS.has(entry.kind))
    Check(setBytes <= TEXTURE_BUDGETS.setBytes, `${entry.id}: 整套 ${KB(setBytes)} ≤ ${KB(TEXTURE_BUDGETS.setBytes)}`);
}
for (const [tier, limit] of Object.entries(TEXTURE_BUDGETS.tierBytes)) {
  Check((tierBytes[tier] || 0) <= limit, `tier ${tier} 合计 ${MB(tierBytes[tier] || 0)} ≤ ${MB(limit)}`);
}
Check(total <= TEXTURE_BUDGETS.totalBytes, `Texture/ 合计 ${MB(total)} ≤ ${MB(TEXTURE_BUDGETS.totalBytes)}`);
console.log(`     ${Object.entries(tierBytes).map(([t, b]) => `${t} ${MB(b)}`).join(" · ")} · 合计 ${MB(total)}`);

// ---------------------------------------------------------------------------------------------------
// 5. 加载层：boot = PBR_SETS；关卡按需集
// ---------------------------------------------------------------------------------------------------
Section("加载层");
const mainSource = fs.readFileSync(path.join(project, "Script_Main.mjs"), "utf8");
const pbrBlock = mainSource.slice(mainSource.indexOf("const PBR_SETS"), mainSource.indexOf("const PBR_LANES"));
const pbrFiles = new Set([...pbrBlock.matchAll(/"\.\/Texture\/([^"?]+)/g)].map((m) => m[1]));
const pbrNames = new Set([...pbrBlock.matchAll(/\{ name: "(\w+)"/g)].map((m) => m[1]));
const bootFiles = new Set(TEXTURE_MANIFEST.filter((e) => e.tier === "boot").flatMap((e) => e.files.map((f) => f[0])));
Check(pbrFiles.size > 0 && [...pbrFiles].every((f) => bootFiles.has(f)), "PBR_SETS 的文件都登记为 tier=boot",
  [...pbrFiles].filter((f) => !bootFiles.has(f)).join("、"));
Check([...bootFiles].every((f) => pbrFiles.has(f)), "tier=boot 的文件都真的在 PBR_SETS 里（开机集不许混进按需图）",
  [...bootFiles].filter((f) => !pbrFiles.has(f)).join("、"));

for (const [levelId, entries] of Object.entries(LEVEL_TEXTURE_SETS)) {
  Check(typeof LEVEL_TEXTURE_BUDGET_BYTES[levelId] === "number", `${levelId}: 有按需集总额`);
  const names = new Set();
  let levelBytes = 0;
  for (const set of entries) {
    const label = `${levelId}/${set.name}`;
    Check(!names.has(set.name), `${label}: 名字不重复`);
    names.add(set.name);
    Check(!pbrNames.has(set.name), `${label}: 不与开机 PBR_SETS 重名`);
    Check(typeof set.v === "string" && set.v.length > 0, `${label}: 有缓存戳 v`);
    Check(!!RECIPES[set.name] || pbrNames.has(set.fallback) || !!RECIPES[set.fallback], `${label}: 读取失败时有可退回的材质（同名配方或 fallback）`);
    if ((set.pack || "Orm") === "none") Check(!!set.ormFrom && (pbrNames.has(set.ormFrom) || !!RECIPES[set.ormFrom]), `${label}: pack=none 要写 ormFrom`);
    const stem = set.stem || set.name;
    const entry = TEXTURE_MANIFEST.find((e) => e.id === stem);
    Check(entry?.tier === `level:${levelId}`, `${label}: 清单里有 ${stem} 且 tier = level:${levelId}`, entry?.tier);
    Check(entry && !entry.legacy, `${label}: 按需集不收 legacy`);
    let setBytes = 0;
    for (const url of Object.values(LevelTextureSetUrls(set))) {
      Check(/\?v=/.test(url), `${label}: URL 带戳`);
      const rel = url.replace(/^\.\/Texture\//, "").split("?")[0];
      Check(byFile.has(rel), `${label}: ${rel} 已登记`);
      setBytes += bytesOf.get(rel) || 0;
    }
    Check(setBytes <= LEVEL_SET_BUDGET_BYTES, `${label}: 整套 ${KB(setBytes)} ≤ ${KB(LEVEL_SET_BUDGET_BYTES)}`);
    levelBytes += setBytes;
  }
  Check(levelBytes <= (LEVEL_TEXTURE_BUDGET_BYTES[levelId] ?? 0), `${levelId}: 按需集合计 ${MB(levelBytes)} ≤ ${MB(LEVEL_TEXTURE_BUDGET_BYTES[levelId] ?? 0)}`);
  console.log(`     ${levelId}: 按需集 ${entries.length} 套 ${MB(levelBytes)} / ${MB(LEVEL_TEXTURE_BUDGET_BYTES[levelId] ?? 0)}`);
}

// LoadLevelTextureSets 的行为：替身 library（不碰 three / 网络）。
{
  const table = { Probe: [
    { name: "ProbeOk", v: "t1", fallback: "Stone" },
    { name: "ProbeFail", v: "t2", fallback: "Stone" },
    { name: "ProbeBaseNormal", v: "t3", pack: "none", ormFrom: "Stone", fallback: "Stone" },
  ] };
  const calls = [];
  const lib = {
    baked: new Map([["Stone", { tag: "stone" }]]),
    materials: new Map([["x", 1]]),
    async LoadExternalSet(name, urls) {
      calls.push(["set", name, urls]);
      if (name === "ProbeFail") throw new Error("404");
      this.baked.set(name, { tag: name });
    },
    async LoadExternalBaseNormal(name, from, urls) { calls.push(["bn", name, from, urls]); this.baked.set(name, { tag: name }); },
  };
  const warnings = [];
  const first = await LoadLevelTextureSets(lib, "Probe", { table, warn: (m) => warnings.push(m) });
  Check(first.loaded.join() === "ProbeOk,ProbeBaseNormal" && first.failed.length === 1, "LoadLevelTextureSets: 成功 / 失败分开汇报", JSON.stringify(first));
  Check(lib.baked.get("ProbeFail")?.tag === "stone" && first.failed[0].fallback === "Stone", "LoadLevelTextureSets: 失败的套借 fallback");
  Check(warnings.length === 1, "LoadLevelTextureSets: 失败只 warn 不抛");
  Check(calls.find((c) => c[1] === "ProbeOk")[2].orm === "./Texture/Texture_ProbeOkOrm.webp?v=t1", "LoadLevelTextureSets: URL 按词干拼、带戳");
  Check(calls.find((c) => c[1] === "ProbeBaseNormal")[0] === "bn" && calls.find((c) => c[1] === "ProbeBaseNormal")[2].orm === undefined,
    "LoadLevelTextureSets: pack=none 走 LoadExternalBaseNormal");
  const before = calls.length;
  await LoadLevelTextureSets(lib, "Probe", { table, warn: () => {} });
  Check(calls.length === before, "LoadLevelTextureSets: 同一 library 同名套只下一次");
  const none = await LoadLevelTextureSets(lib, "NoSuchLevel", { table });
  Check(none.loaded.length === 0 && none.failed.length === 0, "LoadLevelTextureSets: 没登记的关直接空结果");
}

// ---------------------------------------------------------------------------------------------------
// 6. 运行时源码里的贴图 URL
// ---------------------------------------------------------------------------------------------------
Section("运行时贴图 URL");
const runtimeFiles = fs.readdirSync(project)
  // The ignored local bundle duplicates already-audited source, including URLs
  // whose version is appended dynamically. It is not an additional authored source.
  .filter((f) => f !== "Script_BrowserBundle.mjs")
  .filter((f) => (/^(Script_|Data_).*\.mjs$/.test(f) && !/Test\.mjs$/.test(f)) || /^Style_.*\.css$/.test(f) || f === "index.html");
const URL_RE = /Texture\/[A-Za-z0-9_\/]+\.(?:webp|png|jpe?g|hdr)(\?v=[^"'`)\s]+)?/g;
const seenUnstamped = new Set();
const deadUrls = [];
for (const f of runtimeFiles) {
  const lines = fs.readFileSync(path.join(project, f), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    for (const m of line.matchAll(URL_RE)) {
      const rel = m[0].split("?")[0].replace(/^Texture\//, "");
      if (!fs.existsSync(path.join(textureDir, rel))) deadUrls.push(`${f}: ${m[0]}`);
      if (!m[1]) seenUnstamped.add(`${f}|${m[0]}`);
    }
  }
}
Check(deadUrls.length === 0, "运行时源码引用的贴图都存在", deadUrls.join("、"));
const newUnstamped = [...seenUnstamped].filter((k) => !UNSTAMPED_PENDING.has(k) && !STAMPED_BY_LOADER.has(k));
Check(newUnstamped.length === 0, "新写的贴图 URL 都带 ?v= 戳（改图就改戳）", newUnstamped.join("、"));
const staleStamp = [...UNSTAMPED_PENDING, ...STAMPED_BY_LOADER].filter((k) => !seenUnstamped.has(k));
Check(staleStamp.length === 0, "无戳名单没有过期条目（补了戳就从名单删掉，名单只许变短）", staleStamp.join("、"));
console.log(`     无戳待修 ${UNSTAMPED_PENDING.size} 处 · 加载器统一拼戳 ${STAMPED_BY_LOADER.size} 处`);

// ---------------------------------------------------------------------------------------------------
// 7. legacy 冻结名单
// ---------------------------------------------------------------------------------------------------
Section("legacy 名单（只许变短）");
const legacyNow = new Set(TEXTURE_MANIFEST.filter((e) => e.legacy).map((e) => e.id));
const newLegacy = [...legacyNow].filter((id) => !LEGACY_IDS.has(id));
const staleLegacy = [...LEGACY_IDS].filter((id) => !legacyNow.has(id));
Check(newLegacy.length === 0, "没有新增 legacy 条目（新贴图必须按规范来，不许挂 legacy）", newLegacy.join("、"));
Check(staleLegacy.length === 0, "名单里没有已规范化 / 已删除的条目（请从 LEGACY_IDS 删掉，名单只许变短）", staleLegacy.join("、"));
const legacyFiles = TEXTURE_MANIFEST.filter((e) => e.legacy).reduce((n, e) => n + e.files.length, 0);
console.log(`     legacy ${legacyNow.size} 套 / ${legacyFiles} 个文件；规范 ${TEXTURE_MANIFEST.length - legacyNow.size} 套`);

// ---------------------------------------------------------------------------------------------------
if (failures.length) {
  console.log(`\nFAIL ${failures.length} / ${checks}`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
console.log(`\nTextureStandardsTest: ${checks} checks passed`);
