// 独立测试场景通用场地基类（继承 RangeField 统一战场查询契约）。
//
// 从 Taierzhuang1938/Scenes/<Id>/Scene_<Id>.json（经 Script_SceneAssetLoader.AttachSceneAsset 加载出的 layout）
// 自动合批构建平地、网格线、静态体块与碰撞体；各测试场薄子类只需补充自己的动态标牌 Atlas、按需战车等运行时特有项。
//
// 工程约束：不许 Math.random、静态几何一律走 BuildSink 合批、自有材质与贴图在 Dispose 释放。

import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, MakePlane, PlaceGeometry } from "./Script_Geo.mjs";

function ParseHexColor(value, fallback = 0x909397) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  return fallback;
}

/** 生成一张合批文字牌图集（单次 draw call 画完全场多语言文字牌）。 */
export function CreateSignAtlas(signs, {
  cols = 4, tileW = 768, tileH = 160,
  background = "#eef1f1", textColor = "#26323d",
  titleFont = "bold 49px sans-serif", titleY = 57,
  subFont = "27px sans-serif", subY = 121,
  insetPx = 2, anisotropy = 8, accentBar = null, borderColor = null,
} = {}) {
  const rows = Math.max(1, Math.ceil(signs.length / cols));
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW;
  canvas.height = rows * tileH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rects = new Map();
  signs.forEach((sign, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * tileW;
    const y = row * tileH;
    if (borderColor) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 4, y + 4, tileW - 8, tileH - 8);
    }
    if (typeof accentBar === "function") {
      const barColor = accentBar(sign);
      if (barColor) {
        ctx.fillStyle = barColor;
        ctx.fillRect(x + 8, y + 8, tileW - 16, 5);
      }
    }
    ctx.fillStyle = sign.color || textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = titleFont;
    ctx.fillText(sign.text ?? "", x + tileW / 2, y + titleY, tileW - 30);
    if (sign.subtext ?? sign.sub) {
      ctx.font = subFont;
      ctx.fillText(sign.subtext ?? sign.sub, x + tileW / 2, y + subY, tileW - 30);
    }
    rects.set(sign.id, {
      u0: (x + insetPx) / canvas.width,
      u1: (x + tileW - insetPx) / canvas.width,
      v0: 1 - (y + tileH - insetPx) / canvas.height,
      v1: 1 - (y + insetPx) / canvas.height,
    });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return { texture, rects };
}

/** 向 BuildSink 写入一块带图集 UV 的标牌平面。 */
export function AddAtlasSignToSink(sink, materialKey, atlas, id, x, y, z, w, h, rx = 0, ry = 0) {
  const rect = atlas?.rects?.get(id);
  if (!rect) return false;
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
  }
  sink.Add(materialKey, PlaceGeometry(geo, { x, y, z, rx, ry }));
  return true;
}

export class TestSceneField extends RangeField {
  constructor(scene, library, options = {}) {
    const layout = options.whiteboxLayout || null;
    const bounds = options.bounds || layout?.bounds || null;
    super(scene, library, { ...options, bounds });
    this.layout = layout;
    this.generatedExternalProps = [];
    this.defaultSector = options.defaultSector || (layout?.scene || "TestScene");
    this.defaultColliderTag = options.defaultColliderTag || "testFixture";
    this.defaultRoughness = options.defaultRoughness ?? 0.90;
    this.ownedMaterials = new Map();
    this.ownedTextures = [];
    this.markers = new Map((layout?.landmarks || []).map((m) => [m.id, m]));
  }

  /** 按 id 取场景标注锚点（markers）。 */
  Marker(id) {
    return this.markers.get(id) || null;
  }

  /** 按前缀或过滤函数列出场景标注锚点。 */
  Markers(filter = null) {
    const all = this.layout?.landmarks || [];
    if (!filter) return all;
    if (typeof filter === "string") return all.filter((m) => m.id.startsWith(filter));
    return all.filter(filter);
  }

  /** 按色值 / 糙度 / 金属度复用本地标准材质（Dispose 时统一销毁）。 */
  ColorMaterial(colorHex, roughness = this.defaultRoughness, metalness = 0, namePrefix = "TestScene") {
    const hex = ParseHexColor(colorHex);
    const key = `c:${hex.toString(16)}:${roughness}:${metalness}`;
    let material = this.ownedMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        name: `${namePrefix}_${hex.toString(16)}`,
        color: hex,
        roughness,
        metalness,
      });
      this.ownedMaterials.set(key, material);
    }
    return material;
  }

  /** 获取或缓存一块静态体块对应的材质 key 与实例。 */
  _MaterialKeyForBlock(block, materialMap) {
    if (block.libraryMaterial && this.library) {
      const key = `lib:${block.libraryMaterial}`;
      if (!materialMap.has(key)) materialMap.set(key, this.library.Get(block.libraryMaterial));
      return key;
    }
    const hex = block.color
      ? ParseHexColor(block.color)
      : (this.layout?.semanticColors?.[block.semantic] ?? 0x909397);
    const roughness = Number.isFinite(block.roughness) ? block.roughness : this.defaultRoughness;
    const metalness = Number.isFinite(block.metalness) ? block.metalness : 0;
    const key = `c:${hex.toString(16)}:${roughness}:${metalness}`;
    if (!materialMap.has(key)) {
      materialMap.set(key, this.ColorMaterial(hex, roughness, metalness, this.defaultSector));
    }
    return key;
  }

  BuildGround() {
    const b = this.bounds;
    const layout = this.layout;
    if (!layout) { super.BuildGround(); return; }

    // 1) 库材质平地（如玩法测试靶场 / 白刃实验场）
    if (layout.groundLibraryMaterial && !layout.deformableTerrain) {
      const margin = Number.isFinite(layout.groundMarginM) ? layout.groundMarginM : 40;
      const w = (b.maxX - b.minX) + margin * 2;
      const d = (b.maxZ - b.minZ) + margin * 2;
      const mesh = new THREE.Mesh(MakePlane(w, d), this.library.Get(layout.groundLibraryMaterial));
      mesh.position.set((b.minX + b.maxX) * 0.5, 0, (b.minZ + b.maxZ) * 0.5);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `${this.defaultSector}Ground`;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.stats.groundChunks = 1;
      this.stats.groundTris = 2;
      return;
    }

    // 2) 可变形纯色平地（爆炸测试场：克隆 Ground 材质以保持光照与弹坑形变管线一致）
    if (layout.deformableTerrain) {
      const margin = Number.isFinite(layout.groundMarginM) ? layout.groundMarginM : 60;
      const mat = this.library.Get("Ground").clone();
      mat.map = null; mat.normalMap = null; mat.roughnessMap = null; mat.metalnessMap = null; mat.aoMap = null;
      mat.color.setHex(ParseHexColor(layout.groundColor, 0x9ca5a9));
      mat.roughness = 0.96;
      mat.metalness = 0;
      this.ownedMaterials.set("DeformableGround", mat);
      const sink = new BuildSink();
      sink.SetSector(`${this.defaultSector}Ground`);
      sink.Add("Ground", PlaceGeometry(
        MakePlane((b.maxX - b.minX) + margin * 2, (b.maxZ - b.minZ) + margin * 2),
        { x: (b.minX + b.maxX) * 0.5, y: 0, z: (b.minZ + b.maxZ) * 0.5 },
      ));
      for (const mesh of sink.Flush(this.scene, { Get: () => mat })) {
        mesh.name = `${this.defaultSector}Ground`;
        mesh.userData.deformableTerrain = true;
        this.meshes.push(mesh);
      }
      this.stats.groundChunks = 1;
      this.stats.groundTris = 2;
      return;
    }

    // 3) 白盒平地盒 + 可选米格线（操作/枪械/断肢/布料/头发测试场）
    const sink = new BuildSink();
    sink.SetSector(`${this.defaultSector}Floor`);
    const floorMat = this.ColorMaterial(layout.groundColor || "#aeb6bd", this.defaultRoughness, 0, `${this.defaultSector}Floor`);
    const mats = new Map([["Floor", floorMat]]);
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minZ + b.maxZ) * 0.5;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    sink.Add("Floor", PlaceGeometry(MakeBox(w, 0.20, d, 1, "Floor"), { x: cx, y: -0.10, z: cz }));
    this.stats.groundChunks = 1;
    this.stats.groundTris = 12;

    const grid = layout.groundGrid;
    if (grid && grid.stepM > 0) {
      const gridMat = this.ColorMaterial(grid.color || "#929da5", this.defaultRoughness, 0, `${this.defaultSector}Grid`);
      mats.set("Grid", gridMat);
      const lw = grid.lineWidthM || 0.015;
      const lh = grid.lineHeightM || 0.006;
      const ly = grid.y ?? (lh * 0.5);
      for (let x = b.minX + grid.stepM; x < b.maxX; x += grid.stepM) {
        sink.Add("Grid", PlaceGeometry(MakeBox(lw, lh, d, 1, `GridX_${x}`), { x, y: ly, z: cz }));
      }
      for (let z = b.minZ + grid.stepM; z < b.maxZ; z += grid.stepM) {
        sink.Add("Grid", PlaceGeometry(MakeBox(w, lh, lw, 1, `GridZ_${z}`), { x: cx, y: ly, z }));
      }
    }
    for (const mesh of sink.Flush(this.scene, { Get: (key) => mats.get(key) })) {
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
    }
  }

  /** 子类可重写，往同一个 BuildSink 塞入标牌图集、非盒几何等附加静态元素。 */
  BuildExtraStructures(_sink, _materialMap) {}

  BuildStructures() {
    const layout = this.layout;
    if (!layout) { super.BuildStructures(); return; }
    const sink = new BuildSink();
    sink.SetSector(this.defaultSector);
    const materialMap = new Map();

    for (const block of layout.blocks || []) {
      sink.SetSector(block.sector || this.defaultSector);
      if (block.visual !== false) {
        const key = this._MaterialKeyForBlock(block, materialMap);
        const tile = block.libraryMaterial ? (block.tileM ?? 1.2) : 1;
        sink.Add(key, PlaceGeometry(MakeBox(block.w, block.h, block.d, tile, block.id), {
          x: block.x, y: block.y, z: block.z, ry: block.ry || 0,
        }));
      }
      if (block.solid !== false) {
        sink.Solid(
          block.x, block.y, block.z,
          block.w * 0.5, block.h * 0.5, block.d * 0.5,
          block.tag || this.defaultColliderTag,
          block.ry || 0,
          block.surface,
        );
      }
      if (block.cover) {
        sink.Cover(block.x, block.z, block.h, block.cover.faceX, block.cover.faceZ);
      }
      this.stats.structures += 1;
    }

    this.BuildExtraStructures(sink, materialMap);

    for (const mesh of sink.Flush(this.scene, { Get: (key) => materialMap.get(key) || this.library.Get(key) })) {
      if (mesh.material?.isMeshBasicMaterial) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders;
    this.covers = sink.covers.slice();
  }

  Dispose() {
    super.Dispose();
    for (const material of this.ownedMaterials.values()) material.dispose();
    this.ownedMaterials.clear();
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedTextures.length = 0;
  }
}

export default TestSceneField;
