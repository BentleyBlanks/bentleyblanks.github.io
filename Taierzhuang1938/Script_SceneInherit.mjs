// 变体场景北段继承合成：当场景文件带 inherit: { scene, maxZ } 时，只存储 z >= maxZ 的分叉段，
// 运行时把基线场景 z < maxZ 的地形、壕沟基准面、物件、样条、涂色、地标毫秒级拼成标准场景。
//
// 纯模块：零 three、零 DOM，Node 与浏览器共用。

import { SceneDir, SceneFileName, DecodeSceneHeights, EncodeSceneHeights, FlatSceneHeights, IsFlatTerrain } from "./Script_SceneDoc.mjs";
import { DecodeTrenchDatum, EncodeTrenchDatum } from "./Script_SceneTrenches.mjs";

const PointZ = (point) => (Array.isArray(point) ? point[1] : point?.z);

function CropNorthDatumPatches(patches, maxZ) {
  const out = [];
  for (const patch of patches || []) {
    if (patch.minZ >= maxZ) continue;
    const patchMaxZ = patch.minZ + patch.rows * patch.cellM;
    if (patchMaxZ <= maxZ) { out.push(patch); continue; }
    const rows = Math.max(1, Math.floor((maxZ - patch.minZ) / patch.cellM));
    const width = patch.cols + 1;
    out.push({
      minX: patch.minX, minZ: patch.minZ, cellM: patch.cellM, cols: patch.cols, rows,
      heights: patch.heights.slice(0, (rows + 1) * width),
    });
  }
  return out;
}

/**
 * 将带 inherit 的变体场景与基线场景合成完整内存场景。
 * @param {object} doc 变体自身 JSON（若无 inherit 则原样返回）
 * @param {Float32Array} ownHeights 变体自身高度数组
 * @param {Array} ownDatum 变体自身解码后的壕沟基准面块
 * @param {{ doc: object, heights: Float32Array, datum: Array }} base 基线场景数据
 */
export function ResolveInheritedScene(doc, ownHeights, ownDatum, base) {
  if (!doc?.inherit) return { doc, heights: ownHeights, datum: ownDatum || [] };
  if (!base?.doc || !base.heights) throw new Error(`变体场景 ${doc.id} 缺少基线场景 ${doc.inherit.scene}`);
  const maxZ = doc.inherit.maxZ;
  const baseT = base.doc.terrain, ownT = doc.terrain;
  if (baseT.minX !== ownT.minX || baseT.cols !== ownT.cols || baseT.cellM !== ownT.cellM) {
    throw new Error(`变体场景 ${doc.id} 与基线 ${base.doc.id} 的横向地形网格不一致`);
  }
  const splitRow = Math.round((maxZ - baseT.minZ) / ownT.cellM);
  if (splitRow < 0 || splitRow > baseT.rows || Math.abs(baseT.minZ + splitRow * ownT.cellM - ownT.minZ) > 1e-6) {
    throw new Error(`变体场景 ${doc.id} 的切口 z=${maxZ} 未对齐到格点行`);
  }
  const width = ownT.cols + 1;
  const totalRows = splitRow + ownT.rows;
  const heights = new Float32Array((totalRows + 1) * width);
  heights.set(base.heights.subarray(0, splitRow * width), 0);
  heights.set(ownHeights, splitRow * width);

  const datum = [...CropNorthDatumPatches(base.datum, maxZ), ...(ownDatum || [])];
  const ownObjectIds = new Set((doc.objects || []).map((obj) => obj.id));
  const excludeIds = new Set(doc.inherit.excludeIds || []);
  const northObjects = (base.doc.objects || []).filter((obj) =>
    !ownObjectIds.has(obj.id) && !excludeIds.has(obj.id) && (!obj.pos || obj.pos[2] < maxZ));
  const objects = [...northObjects, ...(doc.objects || [])];

  const ownAirWallIds = new Set((doc.airWalls || []).map((wall) => wall.id));
  const northAirWalls = (base.doc.airWalls || []).filter((wall) =>
    !ownAirWallIds.has(wall.id) && !excludeIds.has(wall.id)
    && Array.isArray(wall.points) && wall.points.every((point) => PointZ(point) < maxZ));
  const mergedAirWalls = [...northAirWalls, ...(doc.airWalls || [])];

  const ownSegIds = new Set((doc.trenches?.segments || []).map((seg) => seg.id));
  const northSegments = (base.doc.trenches?.segments || []).filter((seg) =>
    !ownSegIds.has(seg.id) && seg.points.every((point) => point[1] < maxZ));
  const mergedSegments = [...northSegments, ...(doc.trenches?.segments || [])];
  const datumMeta = datum.length ? {
    file: doc.trenches?.datum?.file || base.doc.trenches?.datum?.file || `${SceneFileName(doc.id).replace(".json", ".trench.bin")}`,
    encoding: "int16-cm-le",
    patches: datum.map(({ minX, minZ, cellM, cols, rows }) => ({ minX, minZ, cellM, cols, rows })),
  } : undefined;

  const northPaint = (base.doc.paint || []).filter((entry) =>
    (entry.poly || entry.line || []).some((pt) => PointZ(pt) < maxZ));
  const northMarkers = (base.doc.markers || []).filter((marker) => marker.z < maxZ);
  const northRoads = (base.doc.ways?.roads || []).filter((line) => line.some((pt) => PointZ(pt) < maxZ));
  const northRoadRibbons = (base.doc.ways?.roadRibbons || []).filter((ribbon) => (ribbon.points || []).some((pt) => PointZ(pt) < maxZ));
  const northWayTrenches = (base.doc.ways?.trenches || []).filter((line) => line.some((pt) => PointZ(pt) < maxZ));
  const ownRailIds = new Set((doc.ways?.railways || []).map((r) => r.id).filter(Boolean));
  const northRailways = (base.doc.ways?.railways || []).filter((r) => !ownRailIds.has(r.id));

  const baseSurface = base.doc.surface, ownSurface = doc.surface;
  const surface = baseSurface || ownSurface ? {
    ramps: [
      ...(baseSurface?.ramps || []).filter((r) => r.points.some((pt) => PointZ(pt) < maxZ)),
      ...(ownSurface?.ramps || []),
    ],
    pockets: [
      ...(baseSurface?.pockets || []).filter((p) => p.box[2] < maxZ),
      ...(ownSurface?.pockets || []),
    ],
  } : undefined;

  const { inherit, ...rest } = doc;
  const mergedDoc = {
    ...rest,
    bounds: {
      minX: Math.min(base.doc.bounds.minX, doc.bounds.minX),
      maxX: Math.max(base.doc.bounds.maxX, doc.bounds.maxX),
      minZ: base.doc.bounds.minZ,
      maxZ: doc.bounds.maxZ,
    },
    spawn: doc.inherit.keepOwnSpawn ? doc.spawn : base.doc.spawn,
    terrain: { ...ownT, minZ: baseT.minZ, rows: totalRows },
    look: doc.look || base.doc.look,
    backdrop: doc.backdrop ? {
      ...base.doc.backdrop,
      ...doc.backdrop,
      paint: [
        ...(base.doc.backdrop?.paint || []).filter((entry) => (entry.poly || entry.line || []).some((pt) => PointZ(pt) < maxZ)),
        ...(doc.backdrop?.paint || []),
      ],
    } : base.doc.backdrop,
    paint: [...northPaint, ...(doc.paint || [])],
    ways: {
      roads: [...northRoads, ...(doc.ways?.roads || [])],
      ...(northRoadRibbons.length || doc.ways?.roadRibbons?.length ? {
        roadRibbons: [...northRoadRibbons, ...(doc.ways?.roadRibbons || [])],
      } : {}),
      ...(northRailways.length || doc.ways?.railways?.length ? {
        railways: [...northRailways, ...(doc.ways?.railways || [])],
      } : {}),
      trenches: [...northWayTrenches, ...(doc.ways?.trenches || [])],
    },
    trenches: {
      ...(base.doc.trenches || {}),
      ...(doc.trenches || {}),
      ...(datumMeta ? { datum: datumMeta } : {}),
      segments: mergedSegments,
    },
    markers: [...northMarkers, ...(doc.markers || [])],
    ...(mergedAirWalls.length ? { airWalls: mergedAirWalls } : {}),
    objects,
    ...(surface ? { surface } : {}),
  };
  return { doc: mergedDoc, heights, datum, inheritedFrom: inherit };
}

/** 合成结果编码为二进制字节（供 Worker / TerrainLibraryKey 等只吃原始字节的接口直接消费）。 */
export function EncodeResolvedSceneBinary(resolved) {
  const heightBytes = EncodeSceneHeights(resolved.heights);
  const datumBytes = resolved.datum?.length ? EncodeTrenchDatum(resolved.datum) : null;
  return { heightBytes, datumBytes };
}

async function FetchSingleScene(sceneUrl, fetchFn, bustCache, sourceDoc = null) {
  const suffix = bustCache ? `?t=${Date.now()}` : "";
  let doc = sourceDoc;
  if (!doc) {
    const res = await fetchFn(`${sceneUrl}${suffix}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`场景文件读不到（HTTP ${res.status}）：${sceneUrl}`);
    try { doc = await res.json(); } catch { throw new Error("场景文件不是 JSON"); }
  }
  const baseHref = new URL(sceneUrl, globalThis.location?.href || "http://localhost/Taierzhuang1938/index.html").href;
  let heightBuffer = null, heights;
  if (IsFlatTerrain(doc.terrain)) {
    heights = FlatSceneHeights(doc.terrain);
  } else {
    const heightUrl = new URL(doc.terrain.file, baseHref).href;
    const hRes = await fetchFn(`${heightUrl}${suffix}`, { cache: "no-store" });
    if (!hRes.ok) throw new Error(`高度图读不到（HTTP ${hRes.status}）：${doc.terrain.file}`);
    heightBuffer = await hRes.arrayBuffer();
    heights = DecodeSceneHeights(heightBuffer, doc.terrain);
  }
  let datumBuffer = null, datum = [];
  if (doc.trenches?.datum?.file) {
    const datumUrl = new URL(doc.trenches.datum.file, baseHref).href;
    const dRes = await fetchFn(`${datumUrl}${suffix}`, { cache: "no-store" });
    if (!dRes.ok) throw new Error(`壕沟基准面读不到（HTTP ${dRes.status}）：${doc.trenches.datum.file}`);
    datumBuffer = await dRes.arrayBuffer();
    datum = DecodeTrenchDatum(doc.trenches.datum, datumBuffer);
  }
  return { doc, heights, datum, heightBuffer, datumBuffer, baseHref };
}

/**
 * 浏览器侧读取场景（自动处理 inherit 合成），返回合成后的 doc、heights、datum 以及原始二进制字节。
 */
export async function FetchResolvedScene(sceneUrl, { fetchFn = globalThis.fetch, bustCache = false, sourceDoc = null } = {}) {
  const own = await FetchSingleScene(sceneUrl, fetchFn, bustCache, sourceDoc);
  if (!own.doc.inherit) {
    return {
      rawDoc: own.doc, doc: own.doc, heights: own.heights, datum: own.datum,
      heightBytes: new Uint8Array(own.heightBuffer),
      datumBytes: own.datumBuffer ? new Uint8Array(own.datumBuffer) : null,
    };
  }
  const inheritedId = own.doc.inherit.scene;
  const baseSceneUrl = new URL(`../../${SceneDir(inheritedId)}/${SceneFileName(inheritedId)}`, own.baseHref).href;
  const base = await FetchSingleScene(baseSceneUrl, fetchFn, bustCache);
  const resolved = ResolveInheritedScene(own.doc, own.heights, own.datum, base);
  const { heightBytes, datumBytes } = EncodeResolvedSceneBinary(resolved);
  return {
    rawDoc: own.doc,
    baseDoc: base.doc,
    doc: resolved.doc,
    heights: resolved.heights,
    datum: resolved.datum,
    heightBytes,
    datumBytes,
    inheritedFrom: own.doc.inherit,
  };
}
