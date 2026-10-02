// Script_ShadowCasterBatch 的纯 Node 回归（真 three 对象，假 shadowMap 记录烘焙那一刻的可见性）。
//
//   1. 只收稳定的普通叶子网格：蒙皮 / 有子节点 / 镂空贴图 / 镜像 / 在动的一律不收；按深度材质分组；
//   2. 收进去不改成员任何属性（castShadow、visible 原样）；同一份几何多人共用只加一次；
//   3. 烘焙那一刻：合批打开、成员藏起来；烘完原样还原；三方早退条件下一位都不翻；
//   4. 任何变化（移动、被藏、castShadow 被关、几何版本、换材质、长出子节点、摘出场景）当帧踢出；
//   5. 冷却期过后重新收；关掉时全部还原、烘焙不再换人；
//   6. 预热代理：共用批次深度一只 + 每只自定义深度材质一只，克隆与真合批共用。
//
// 用法：node Taierzhuang1938/Script_ShadowCasterBatchTest.mjs

import * as THREE from "three";
import { ShadowCasterBatch, InstallShadowCasterBatch } from "./Script_ShadowCasterBatch.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

const TUNING = { enabled: true, settleFrames: 5, cooldownFrames: 10, rescanFrames: 3, joinBudgetMs: 1e9,
  minInstanceCapacity: 4, minVertexCapacity: 64 };

const scene = new THREE.Scene();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const plain = new THREE.MeshStandardMaterial();
const staticDepth = new THREE.MeshDepthMaterial(); staticDepth.name = "StaticDepth";
const Mesh = (name, x, { geometry = boxGeometry, material = plain, depth } = {}) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.position.set(x, 0, 0); mesh.castShadow = true;
  if (depth) mesh.customDepthMaterial = depth;
  scene.add(mesh);
  return mesh;
};
const wallA = Mesh("wallA", 0);
const wallB = Mesh("wallB", 3);                         // 与 wallA 共用同一份几何
const trench = Mesh("trench", 6, { geometry: new THREE.BoxGeometry(2, .5, 4), depth: staticDepth });
const moving = Mesh("moving", 9);
const parent = Mesh("parent", 12); parent.add(new THREE.Mesh(boxGeometry, plain));
const cutout = Mesh("cutout", 15, { material: new THREE.MeshStandardMaterial({ alphaTest: .5, map: new THREE.Texture() }) });
const mirrored = Mesh("mirrored", 18); mirrored.scale.x = -1;
const noShadow = Mesh("noShadow", 21); noShadow.castShadow = false;
const skinned = new THREE.SkinnedMesh(boxGeometry, plain); skinned.castShadow = true; scene.add(skinned);

const batch = new ShadowCasterBatch(scene, { tuning: TUNING, cloneDepthMaterial: (m) => { const c = m.clone(); c.name = m.name + "_clone"; return c; } });
const Frame = (fn) => { if (fn) fn(); scene.updateMatrixWorld(); batch.Update(); };
// 0. 没预热过的深度程序一律不收（否则游戏中途现编）
for (let i = 0; i < 8; i += 1) Frame();
Check("预热之前一个都不收", batch.groups.size === 0 && batch.stats.members === 0);
const unknownDepth = new THREE.MeshDepthMaterial(); unknownDepth.name = "Unknown";
const lateComer = new THREE.Mesh(boxGeometry, plain); lateComer.name = "lateComer"; lateComer.castShadow = true;
batch.DisposeWarmProxy(batch.WarmProxy([]));   // 扫到场上的 staticDepth；lateComer 这时还不在场
Check("预热扫到场上现有的自定义深度材质", batch.warmedDepth.has(staticDepth) && batch.warmedDepth.has("shared"));
lateComer.customDepthMaterial = unknownDepth; lateComer.position.set(30, 0, 0); scene.add(lateComer);
for (let i = 0; i < 8; i += 1) Frame(() => { moving.position.y = i * .1; });

const members = () => [...batch.groups.values()].flatMap((g) => g.objects.map((o) => o.name)).sort();
Check("只收稳定的普通叶子（没预热过深度材质的 lateComer 不收）", JSON.stringify(members()) === JSON.stringify(["trench", "wallA", "wallB"]), JSON.stringify(members()));
Check("按深度材质分两组", batch.groups.size === 2 && batch.live.length === 2, `${batch.groups.size}/${batch.live.length}`);
Check("成员属性一个不改", wallA.castShadow && wallA.visible && trench.castShadow && trench.visible);
{
  const shared = [...batch.groups.values()].find((g) => g.objects.includes(wallA));
  const entry = shared.geometries.get(boxGeometry);
  Check("共用几何只加一次", shared.geometries.size === 1 && entry.refs === 2, `${shared.geometries.size} / refs ${entry?.refs}`);
  const matrix = new THREE.Matrix4();
  shared.mesh.getMatrixAt(batch.records.get(wallB).instanceId, matrix);
  Check("实例矩阵 = 成员 matrixWorld", matrix.equals(wallB.matrixWorld));
  const custom = [...batch.groups.values()].find((g) => g.objects.includes(trench));
  Check("自定义深度材质用克隆", custom.mesh.customDepthMaterial?.name === "StaticDepth_clone");
  Check("合批网格平时藏着", !shared.mesh.visible && !custom.mesh.visible);
}

// 3. 烘焙那一刻换人
const seen = [];
const shadowMap = {
  enabled: true, autoUpdate: false, needsUpdate: true,
  render() { seen.push({ batches: batch.live.map((g) => g.mesh.visible), wallA: wallA.visible, trench: trench.visible, moving: moving.visible }); },
};
const renderer = { shadowMap };
InstallShadowCasterBatch(renderer, batch);
Check("重复安装幂等", InstallShadowCasterBatch(renderer, batch) === false);
shadowMap.render([{}], scene, null);
{
  const s = seen.at(-1);
  Check("烘焙时合批打开、成员藏起、别的不动", s.batches.every(Boolean) && !s.wallA && !s.trench && s.moving, JSON.stringify(s));
  Check("烘完原样还原", wallA.visible && trench.visible && batch.live.every((g) => !g.mesh.visible));
  shadowMap.needsUpdate = false;
  shadowMap.render([{}], scene, null);
  Check("三方早退时一位都不翻", seen.at(-1).wallA === true && seen.at(-1).batches.every((v) => !v));
  shadowMap.needsUpdate = true;
}

// 4. 任何变化当帧踢出
const Evicted = (name, mutate) => {
  const before = batch.stats.evictions;
  Frame(mutate);
  const out = !members().includes(name);
  Check(`${name}：变化当帧踢出`, out && batch.stats.evictions === before + 1, JSON.stringify(members()));
};
Evicted("wallB", () => { wallB.position.z = .5; });
{
  const shared = [...batch.groups.values()].find((g) => g.objects.includes(wallA));
  Check("共用几何引用数跟着减", shared.geometries.get(boxGeometry).refs === 1);
}
shadowMap.render([{}], scene, null);
Check("踢出的那一只烘焙时不再被藏", wallB.visible === true);
Evicted("wallA", () => { wallA.visible = false; });
wallA.visible = true;
Evicted("trench", () => { trench.geometry.attributes.position.needsUpdate = true; });
Check("全部踢空后组不再上场", batch.live.length === 0);

// 5. 冷却后重新收；castShadow 被关、长子节点、摘出场景
for (let i = 0; i < 20; i += 1) Frame();
// moving 从第 8 帧起就停了：停够 settleFrames 帧一样收进来（「静态」看的是这段时间有没有动，不看名字）
Check("冷却期过后重新收、停下来的也收", JSON.stringify(members()) === JSON.stringify(["moving", "trench", "wallA", "wallB"]), JSON.stringify(members()));
Evicted("wallA", () => { wallA.castShadow = false; });
wallA.castShadow = true;
Evicted("wallB", () => { wallB.add(new THREE.Object3D()); });
Evicted("trench", () => { scene.remove(trench); });
Check("摘出场景的登记被删", !batch.records.has(trench));
scene.add(trench);
for (let i = 0; i < 20; i += 1) Frame();
Check("挂回来重新收", members().includes("trench"));
Check("镜像件永不收", !members().includes("mirrored"));

// 6. 关掉全部还原
batch.SetEnabled(false);
Frame();
seen.length = 0;
shadowMap.render([{}], scene, null);
Check("关掉后烘焙不换人、合批撤下", seen.at(-1).trench === true && batch.groups.size === 0 && batch.root.children.length === 0);
batch.SetEnabled(true);

// 7. 预热代理
{
  const proxy = batch.WarmProxy([staticDepth]);
  const meshes = proxy.children.filter((o) => o.isBatchedMesh);
  // （共用批次 + 传进来的 staticDepth + 场上 lateComer 的 unknownDepth）× 正 / 背 / 双面
  Check("预热代理：共用批次 + 每只深度材质的克隆，各三种面", meshes.length === 9
    && new Set(meshes.map((m) => m.material.side)).size === 3
    && meshes.some((m) => m.customDepthMaterial === batch.depthClones.get(staticDepth))
    && meshes.some((m) => m.customDepthMaterial === batch.depthClones.get(unknownDepth)), `${meshes.length}`);
  Check("扫到之后 lateComer 也登记为可收", batch.warmedDepth.has(unknownDepth));
  batch.DisposeWarmProxy(proxy);
  for (let i = 0; i < 12; i += 1) Frame();
  const custom = [...batch.groups.values()].find((g) => g.objects.includes(trench));
  Check("真合批复用预热时的克隆", custom?.mesh.customDepthMaterial === batch.depthClones.get(staticDepth));
}

// 8. 进关一次收满（Prime）：不等 settleFrames、不受逐帧预算，排除子树不收，之后逐帧对账照常
{
  const fresh = new THREE.Scene();
  const Put = (name, x, parentNode = fresh) => {
    const mesh = new THREE.Mesh(boxGeometry, plain); mesh.name = name; mesh.position.set(x, 0, 0); mesh.castShadow = true;
    parentNode.add(mesh); return mesh;
  };
  const a = Put("primeA", 0), b = Put("primeB", 3);
  const warm = new THREE.Group(); warm.name = "WarmProxy"; fresh.add(warm);
  const proxyBox = Put("primeProxy", 6, warm);
  const primed = new ShadowCasterBatch(fresh, { tuning: { ...TUNING, settleFrames: 1000, joinBudgetMs: 0 } });
  primed.DisposeWarmProxy(primed.WarmProxy([]));
  fresh.updateMatrixWorld();
  const joined = primed.Prime({ exclude: warm });
  const names = [...primed.groups.values()].flatMap((g) => g.objects.map((o) => o.name)).sort();
  Check("Prime：一次收满静止的投影体", joined === 2 && JSON.stringify(names) === JSON.stringify(["primeA", "primeB"]), `${joined} ${JSON.stringify(names)}`);
  Check("Prime：排除子树里的不收", !names.includes(proxyBox.name));
  Check("Prime：统计与在场批次同步", primed.stats.members === 2 && primed.live.length === 1, `${primed.stats.members}/${primed.live.length}`);
  fresh.updateMatrixWorld(); primed.Update();
  Check("Prime 之后静止的成员不被踢", primed.stats.members === 2 && primed.stats.evictions === 0, `${primed.stats.members}/${primed.stats.evictions}`);
  b.position.y = 1; fresh.updateMatrixWorld(); primed.Update();
  Check("Prime 之后变化当帧踢出", primed.records.get(b)?.state !== undefined && primed.stats.members === 1 && primed.stats.evictions === 1, `${primed.stats.members}/${primed.stats.evictions}`);
  Check("Prime 不动成员属性", a.castShadow && a.visible && b.castShadow && b.visible);
}

console.log(failed ? `FAIL ${failed} 项` : "PASS ShadowCasterBatch：只收稳定叶子、烘焙那一刻换人并原样还原、变化当帧踢出、不改成员属性、关掉全还原、预热复用克隆、进关一次收满");
process.exit(failed ? 1 : 0);
