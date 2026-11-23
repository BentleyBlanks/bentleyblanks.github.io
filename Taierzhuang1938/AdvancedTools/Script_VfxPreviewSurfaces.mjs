// 特效预览的参考场地件：静态盒子合批（与 Script_World.BuildSink 同一合并口径）+ 中性材质库。
//
// 照明弹场地、落土台子这些「看光照范围、看落点」的参考物以前直接 import 了城市生成器（BuildSink）
// 与正片材质库（CloneShadedMaterial）。这里只留它们真正用到的那一点：
//   · PreviewSink：按 分区 × 材质名 收集盒子几何，Flush 时用 Script_Geo.MergeGeometries 合成一只网格，
//     effectSurface 标记照样换算成 effectSurfaceRanges（照明弹的落点 / 投影查询认它）；
//   · 材质：宿主给的材质库若有 CloneShaded（游戏里的 MaterialLibrary）就借正片材质再调底色，
//     独立窗口给的是 PreviewMaterialLibrary —— 只有底色与粗糙度的中性 PBR，不读任何贴图。

import * as THREE from "three";
import { MergeGeometries } from "../Script_Geo.mjs";

export class PreviewSink {
  constructor() {
    this.buckets = new Map(); // "sector|materialName" -> geometry[]
    this.sector = "";
  }

  SetSector(name) { this.sector = String(name || ""); }

  Add(materialName, geometry, { effectSurface = false } = {}) {
    if (effectSurface) geometry.userData.effectSurface = true;
    const key = `${this.sector}|${materialName}`;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(geometry);
  }

  /** library.Get(materialName) 给材质；返回建出来的网格。 */
  Flush(root, library, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [key, list] of this.buckets) {
      // 与 BuildSink.Flush 同一换算：各段的 effectSurface 标记按合并后的索引偏移记成区间。
      const effectSurfaceRanges = [];
      let surfaceOffset = 0;
      for (const g of list) {
        const count = g.index?.count ?? g.attributes.position?.count ?? 0;
        for (const [start, n] of g.userData.effectSurfaceRanges || (g.userData.effectSurface ? [[0, count]] : [])) {
          effectSurfaceRanges.push([surfaceOffset + start, n]);
        }
        surfaceOffset += count;
      }
      const geometry = MergeGeometries(list);
      if (effectSurfaceRanges.length) geometry.userData.effectSurfaceRanges = effectSurfaceRanges;
      if (!geometry.attributes.position || geometry.attributes.position.count === 0) continue;
      const name = key.slice(key.indexOf("|") + 1);
      const mesh = new THREE.Mesh(geometry, library.Get(name));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = `Static_${key}`;
      root.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

/**
 * 借宿主材质库的一份私有副本（有 CloneShaded 就用正片材质），否则按底色建中性 PBR。
 * 正片材质带贴图（map × color）；无贴图的中性材质把 tint 乘在基础反照率上，避免地面在夜里被照明弹照成一片死白。
 * roughness 不给就保留材质自己的（中性材质缺省 0.9）。
 */
export function PreviewSurfaceMaterial(library, name, { color = 0x808080, roughness } = {}) {
  const material = library?.CloneShaded ? library.CloneShaded(name) : new THREE.MeshStandardMaterial({ color: 0x5a554c, roughness: 0.9 });
  if (material.map) material.color.setHex(color);
  else material.color.multiply(new THREE.Color(color));
  if (roughness !== undefined) material.roughness = roughness;
  return material;
}

/** 独立窗口用的中性材质库：Get(name) 给一份按名字缓存的纯底色 PBR（反照率接近真实土/砖/木贴图的均值）。 */
export class PreviewMaterialLibrary {
  constructor() {
    this.materials = new Map();
    this.baked = new Set();
  }

  static Tint(name) {
    if (/Ground/i.test(name)) return { color: 0x5c564c, roughness: 1 };
    if (/Brick|Wall/i.test(name)) return { color: 0x58534b, roughness: 0.95 };
    if (/Wood/i.test(name)) return { color: 0x4f4434, roughness: 0.94 };
    return { color: 0x5c5a54, roughness: 0.9 };
  }

  Get(name) {
    if (!this.materials.has(name)) {
      const tint = PreviewMaterialLibrary.Tint(name);
      const material = new THREE.MeshStandardMaterial({ color: tint.color, roughness: tint.roughness, metalness: 0 });
      material.name = `Preview_${name}`;
      this.materials.set(name, material);
    }
    return this.materials.get(name);
  }

  CloneShaded(name) {
    const material = this.Get(name).clone();
    material.name = this.Get(name).name;
    return material;
  }

  Dispose() {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
