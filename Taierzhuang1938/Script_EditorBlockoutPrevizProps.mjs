// 白盒预演的道具网格（docs/Data_EditorBlockout.md §14，2026-10-19）：预演用的占位动作库里有几条片段带着开场道具层不认识的
// 道具轨（Script_OpeningProps.OpeningPropSet 只会画刺刀、横木、步枪和开场重构那几样）：
//   launcher：八九式掷弹筒（PvIjaLauncherFire；Model_Type89Launcher，按武器网格建）
//   shell   ：掷弹筒弹（PvIjaLauncherLoad；小圆柱，弹头朝轴向）
//   bundle  ：一捆手榴弹（PvCrawlCarryBundle；五根木柄手榴弹捆在一起，轴沿木柄朝头）
// 挂载约定同开场道具：长轴 = 本地 −Z，上 = 本地 +Y，原点 = 道具轨的点。预演读开场库时 RegisterPrevizProps 一次。
// 游戏本身不调用这个模块。

import * as THREE from "three";

let registered = false;

function Owned() { return { geometries: [], materials: [] }; }
function Mat(owned, color, roughness = 0.8, metalness = 0.1) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  owned.materials.push(m);
  return m;
}
/** 沿本地 Z 的圆柱（z0 → z1）。 */
function Rod(owned, material, radius, z0, z1, x = 0, y = 0, segments = 8) {
  const g = new THREE.CylinderGeometry(radius, radius, Math.abs(z1 - z0), segments);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  owned.geometries.push(g);
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  return mesh;
}

/** 掷弹筒：游戏里的武器网格（同 Script_OpeningProps WeaponObject 的建法）；没有工厂时用一根短管顶上。 */
function BuildLauncher(actor) {
  const owned = Owned();
  const group = new THREE.Group();
  group.name = "PrevizProp_launcher";
  const factory = actor?.factory;
  const built = factory?.WeaponGeometry?.("Type89Launcher", 0, {});
  let axis = new THREE.Vector3(0, 0, -1);
  if (built?.geometries) {
    const materials = actor?.materials || factory.ActorMaterials?.("ija", () => 0.5) || {};
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, materials[key] || materials.steel || Mat(owned, 0x3a3a36, 0.5, 0.6));
      mesh.name = `PrevizProp_launcher_${key}`; mesh.castShadow = true;
      group.add(mesh);
    }
    const muzzle = built.muzzle?.clone?.();
    if (muzzle && muzzle.lengthSq() > 1e-8) axis = new THREE.Vector3(0, 0, Math.sign(muzzle.z) || -1);
  } else {
    const steel = Mat(owned, 0x3a3a36, 0.5, 0.6);
    group.add(Rod(owned, steel, 0.025, 0.06, -0.35));
    group.add(Rod(owned, steel, 0.05, 0.16, 0.19, 0, -0.02));
  }
  return Object.assign(owned, { object: group, axis });
}

/** 弹：直径 5 cm、长 18 cm，弹头朝 −Z。 */
function BuildShell() {
  const owned = Owned();
  const group = new THREE.Group();
  group.name = "PrevizProp_shell";
  group.add(Rod(owned, Mat(owned, 0x4a4a3c, 0.6, 0.4), 0.025, 0.09, -0.06));
  group.add(Rod(owned, Mat(owned, 0x6a5a38, 0.6, 0.4), 0.02, -0.06, -0.09));
  return Object.assign(owned, { object: group, axis: new THREE.Vector3(0, 0, -1) });
}

/** 一捆手榴弹：五根木柄（长 0.2 m）+ 铁头，中间一道绳，轴沿木柄朝头（−Z）。 */
function BuildBundle() {
  const owned = Owned();
  const group = new THREE.Group();
  group.name = "PrevizProp_bundle";
  const wood = Mat(owned, 0x8a6a40, 0.85), iron = Mat(owned, 0x3c3c38, 0.55, 0.5), rope = Mat(owned, 0xb8a888, 0.95);
  const spots = [[0, 0], [0.045, 0], [-0.045, 0], [0.022, 0.04], [-0.022, 0.04]];
  for (const [x, y] of spots) {
    group.add(Rod(owned, wood, 0.016, 0.14, -0.04, x, y - 0.02, 6));
    group.add(Rod(owned, iron, 0.024, -0.04, -0.12, x, y - 0.02, 8));
  }
  group.add(Rod(owned, rope, 0.072, 0.03, 0.0, 0, 0, 10));
  return Object.assign(owned, { object: group, axis: new THREE.Vector3(0, 0, -1) });
}

/** 把三样道具登记到开场道具层（registerFn = Script_OpeningProps.RegisterOpeningProp）。只登记一次。 */
export function RegisterPrevizProps(registerFn) {
  if (registered || typeof registerFn !== "function") return;
  registerFn("launcher", BuildLauncher);
  registerFn("shell", BuildShell);
  registerFn("bundle", BuildBundle);
  registered = true;
}
