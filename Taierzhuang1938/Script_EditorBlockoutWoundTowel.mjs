// 白盒关卡编辑器里冬瓜肚子上塞的那条毛巾（2026-10-31，用户：他身上不是还塞了一块布么？）。
//
// 剧本 07：「肚子上塞着一条毛巾，已经吸透了血，黑红发硬」「就他妈塞个毛巾？」。白盒只要看得见位置和吸透的样子：
// 一块折起来的毛巾（叠成一摞的厚片、边缘收薄、面上几道褶，程序化几何），不做布料模拟，每帧按倒地的人骨盆→胸口、两肩
// 摆到肚子正面（BlockoutPuppets._StepTowels）。贴图借布料测试场毛巾样片的底色和法线（Script_ClothSampleMaterials "towel"，全场一份），
// 材质是普通 MeshStandardMaterial（白盒只要看得见，不用样片那只带粗糙度图、绒光的 MeshPhysicalMaterial，少占采样器）。
// 网格标 whiteboxCharacter：白盒画质（编辑器默认）不把它刷成灰网格，血迹补丁才看得见。
// 吸血走布料测试场那套双面吸血（Script_ClothBlood，毛巾档 towel）：贴肚子的背面接血，造出来时倒 soakMl、空推 soakS 秒
// （正面透出来、晕到边），之后背面每秒再渗 feedMlS，总量到 capMl 停。
// 谁塞：倒地（state "down"）的人里，名字在 names 里的（冬瓜），或单位写了 woundTowel: true 的；站起来就拿掉。

import * as THREE from "three";
import { CreateClothSampleMaterials } from "./Script_ClothSampleMaterials.mjs";
import { ClothBlood } from "./Script_ClothBlood.mjs";

export const BLOCKOUT_WOUND_TOWEL = Object.freeze({
  /** 叠好的毛巾：宽（顺两肩）、长（顺脊柱）、厚，米；边缘收薄到厚度的 edgeThin 倍；面上褶的起伏。 */
  widthM: 0.2, lengthM: 0.25, thickM: 0.035, edgeThin: 0.35, foldM: 0.008,
  /** 摆位：骨盆→胸口这个比例处，沿身体正面离脊柱 depthM（骨在身体中线，军装 + 皮带前面约 0.15 m 才露出来）。 */
  along: 0.42, depthM: 0.15,
  /** 吸血（文件头）。 */
  profile: "towel", soakMl: 30, soakS: 45, feedMlS: 0.1, capMl: 45,
  names: Object.freeze(["冬瓜"]),
});
const W = BLOCKOUT_WOUND_TOWEL;

/** 这个单位倒着时要不要塞毛巾。 */
export function WantsWoundTowel(unit) {
  return unit?.woundTowel === true || (unit?.woundTowel !== false && W.names.includes(unit?.name));
}

let material = null;
function TowelMaterial() {
  if (!material) {
    const sample = CreateClothSampleMaterials("towel").materials[0];
    // 样片贴图按 1.45 × 1.75 m 的旗面铺；毛巾小，按它自己的尺寸重铺，织纹粗细不变
    for (const t of [sample.map, sample.normalMap]) t?.repeat.set(W.widthM / (t.userData.tileSizeM || 0.14), W.lengthM / (t.userData.tileSizeM || 0.14));
    material = new THREE.MeshStandardMaterial({ name: "BlockoutWoundTowel", map: sample.map, normalMap: sample.normalMap,
      normalScale: sample.normalScale.clone(), roughness: 0.95, metalness: 0 });
  }
  return material;
}

/** 叠起来的毛巾：BoxGeometry 分段，上下两面中间鼓、边缘收薄，加几道斜褶（上下一起挪，厚度不变）。X 宽、Z 长、Y 厚（+Y 朝外）。 */
function TowelGeometry() {
  const g = new THREE.BoxGeometry(W.widthM, W.thickM, W.lengthM, 12, 1, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = 1 - (2 * x / W.widthM) ** 4, ez = 1 - (2 * z / W.lengthM) ** 4, e = Math.max(0, ex * ez);
    const fold = W.foldM * (Math.sin(x * 41 + z * 13) * 0.6 + Math.sin(z * 31 - x * 9) * 0.4) * e;
    p.setY(i, y * (W.edgeThin + (1 - W.edgeThin) * e) + fold);
  }
  g.computeVertexNormals();
  return g;
}

const _p = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3(), _r = new THREE.Vector3();
const _up = new THREE.Vector3(), _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _m = new THREE.Matrix4();

/** 一条毛巾。→ { mesh, blood, Pose(rig) → bool, Advance(dt), Probe(), Dispose() } */
export function CreateWoundTowel() {
  const mesh = new THREE.Mesh(TowelGeometry(), TowelMaterial());
  mesh.name = "BlockoutWoundTowel";
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.userData.whiteboxCharacter = true;
  const sourceGeometry = mesh.geometry;
  let blood = null;
  try {
    blood = new ClothBlood(mesh, { width: W.widthM, length: W.lengthM, profile: W.profile });
    blood.Inject({ u: 0.5, v: 0.5, side: -1, amountMl: W.soakMl, ageS: 0 });
    blood.Advance(W.soakS);
    blood.StartFeed({ u: 0.5, v: 0.5, side: -1, rateMlS: W.feedMlS });
  } catch (error) { console.warn("[BlockoutWoundTowel] cloth blood failed; plain towel", error); blood = null; }
  return {
    mesh, blood,
    /** 摆到倒地的人肚子正面：骨盆→胸口当「上」、两肩当「右」，正面 = 上 × 右。骨头缺了 → false（藏起来）。 */
    Pose(rig) {
      const b = rig?.bones;
      if (!b?.pelvis || !b.chest || !b.upperArmL || !b.upperArmR) return false;
      _p.setFromMatrixPosition(b.pelvis.matrixWorld); _c.setFromMatrixPosition(b.chest.matrixWorld);
      _l.setFromMatrixPosition(b.upperArmL.matrixWorld); _r.setFromMatrixPosition(b.upperArmR.matrixWorld);
      _up.subVectors(_c, _p);
      if (_up.lengthSq() < 1e-6) return false;
      _up.normalize();
      _right.subVectors(_r, _l);
      _right.addScaledVector(_up, -_up.dot(_right));
      if (_right.lengthSq() < 1e-6) return false;
      _right.normalize();
      _fwd.crossVectors(_up, _right).normalize();
      _m.makeBasis(_right, _fwd, _up).setPosition(_p.lerp(_c, W.along).addScaledVector(_fwd, W.depthM));
      mesh.matrix.copy(_m);
      if (mesh.parent) mesh.matrix.premultiply(_m.copy(mesh.parent.matrixWorld).invert());
      mesh.matrixWorldNeedsUpdate = true;
      return true;
    },
    Advance(dt) {
      if (!blood || !(dt > 0)) return;
      if (blood.feed && blood.injectedMl >= W.capMl) blood.StopFeed();
      blood.Advance(dt);
    },
    Probe() {
      const s = blood?.State();
      return s ? { injectedMl: +s.injectedMl.toFixed(1), frontM2: +s.front.areaM2.toFixed(4), backM2: +s.back.areaM2.toFixed(4), feeding: s.feeding } : { blood: false };
    },
    Dispose() { blood?.Dispose(); mesh.removeFromParent(); sourceGeometry.dispose(); },
  };
}
