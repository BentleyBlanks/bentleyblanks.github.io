// Data_Meshes.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MESHES, MESH_REV, MODEL_BASE, WEAPON_MESH_BY_ID, WEAPON_MESH_VARIANTS } from "./Data_Meshes.mjs";

/** 取一个模型的 url。id 不认识时返回 null（调用方退回程序化几何）。 */
export function MeshUrl(id) {
  const entry = MESHES[id];
  return entry ? `${MODEL_BASE}${entry.file}?v=${MESH_REV}` : null;
}

/** 按类别列 id。 */
export function MeshIds(category = null) {
  return Object.keys(MESHES).filter((id) => !category || MESHES[id].category === category);
}

/** 全部模型的 url，给 PreloadModels 用。 */
export function AllMeshUrls() {
  return MeshIds().map((id) => `${MODEL_BASE}${MESHES[id].file}?v=${MESH_REV}`);
}

/** 越界或已退役的变体编号回到该武器的默认模型，兼容旧掉落和编辑器数据。 */
export function WeaponMeshId(weaponId, variant = 0) {
  const list = WEAPON_MESH_VARIANTS[weaponId];
  if (list && variant > 0 && variant < list.length) return list[variant];
  return WEAPON_MESH_BY_ID[weaponId];
}
