// Script_PrepassStaticBatch 的纯 Node 回归（真 three 对象，假 shadowMap 记录烘焙那一刻的可见性）：
//
//   1. 只收稳定的不透明普通叶子；蒙皮 / 有子节点 / 镂空 / 半透明 / 镜像 / 前景 / 别的逐 draw 钩子 /
//      skipNormalDepth / 覆盖材质换不掉的一律不收；BuildSink 的破口钩子（prepassDamageHook）照收；
//   2. 按「破口裁切 × 地形融合接收」分组，共用几何只加一份（只带 position + normal），实例矩阵 = matrixWorld；
//   3. 预通道那一刻合批打开、成员藏起、速度历史照记；烘阴影的那一刻成员还回来；画完原样还原；
//   4. 任何变化当帧踢出、冷却后重收；Prime 不等静止帧一次收满、排除子树不收；关掉全还原。
//
// 用法：node Taierzhuang1938/Script_PrepassStaticBatchTest.mjs

import * as THREE from "three";
import { PrepassStaticBatch, InstallPrepassStaticBatch, PrepassBatchable } from "./Script_PrepassStaticBatch.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  → ${detail}`}`);
  if (!ok) failed += 1;
};

const TUNING = { enabled: true, settleFrames: 5, cooldownFrames: 10, rescanFrames: 3, joinBudgetMs: 1e9,
  minInstanceCapacity: 4, minVertexCapacity: 64, reserveScale: 1 };

const scene = new THREE.Scene();
const box = new THREE.BoxGeometry(1, 1, 1);
const plain = new THREE.MeshStandardMaterial();
const blendMaterial = new THREE.MeshStandardMaterial(); blendMaterial.userData.terrainBlendReceiver = true;
const Hook = () => {};
const Mesh = (name, x, { geometry = box, material = plain, damage = false, parent = scene } = {}) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.position.set(x, 0, 0);
  if (damage) { mesh.onBeforeRender = Hook; mesh.onAfterRender = Hook; mesh.userData.prepassDamageHook = true; }
  parent.add(mesh);
  return mesh;
};
const wallA = Mesh("wallA", 0);
const wallB = Mesh("wallB", 3);                                   // 与 wallA 共用同一份几何
const trench = Mesh("trench", 6, { geometry: new THREE.BoxGeometry(2, .5, 4), material: blendMaterial });
const sink = Mesh("sink", 9, { damage: true });                   // BuildSink 静态件（破口钩子）
const moving = Mesh("moving", 12);
const parent = Mesh("parent", 15);
const leaf = new THREE.Mesh(box, plain); leaf.name = "leaf"; parent.add(leaf);   // 有子节点的不收，它下面的叶子照收
const cutout = Mesh("cutout", 18, { material: new THREE.MeshStandardMaterial({ alphaTest: .5, map: new THREE.Texture() }) });
const glass = Mesh("glass", 21, { material: new THREE.MeshStandardMaterial({ transparent: true, opacity: .5 }) });
const mirrored = Mesh("mirrored", 24); mirrored.scale.x = -1;
const hooked = Mesh("hooked", 27); hooked.onBeforeRender = Hook;
const skipped = Mesh("skipped", 30); skipped.userData.skipNormalDepth = true;
const noOverride = Mesh("noOverride", 33, { material: Object.assign(new THREE.MeshBasicMaterial(), { allowOverride: false }) });
const foregroundRoot = new THREE.Group(); foregroundRoot.userData.foregroundPrepassRoot = true; scene.add(foregroundRoot);
const gun = Mesh("gun", 36, { parent: foregroundRoot });
const skinned = new THREE.SkinnedMesh(box, plain); skinned.name = "skinned"; scene.add(skinned);
const noNormal = new THREE.BufferGeometry(); noNormal.setAttribute("position", box.getAttribute("position").clone());
const bare = Mesh("bare", 39, { geometry: noNormal });

Check("形状判据：普通叶子 / 破口钩子收", PrepassBatchable(wallA) && PrepassBatchable(sink));
Check("形状判据：蒙皮 / 有子节点 / 镂空 / 半透明 / 别的钩子 / skipNormalDepth / 换不掉材质 / 没法线 不收",
  ![skinned, parent, cutout, glass, hooked, skipped, noOverride, bare].some(PrepassBatchable));

const batch = new PrepassStaticBatch(scene, { tuning: TUNING });
const Frame = (fn) => { if (fn) fn(); scene.updateMatrixWorld(); batch.Update(); };
for (let i = 0; i < 8; i += 1) Frame(() => { moving.position.y = i * .1; });

const members = () => [...batch.groups.values()].flatMap((g) => g.objects.map((o) => o.name)).sort();
const STILL = ["leaf", "sink", "trench", "wallA", "wallB"];
Check("只收稳定的不透明叶子（前景 / 镜像 / 会动的不收）", JSON.stringify(members()) === JSON.stringify(STILL), JSON.stringify(members()));
Check("按破口 × 地形融合分三组", batch.groups.size === 3 && batch.live.length === 3, `${batch.groups.size}/${batch.live.length}`);
{
  const shared = [...batch.groups.values()].find((g) => g.objects.includes(wallA));
  const entry = shared.geometries.get(box);
  Check("共用几何只加一份", shared.geometries.size === 1 && entry.refs === 3, `${shared.geometries.size} / refs ${entry?.refs}`);
  const attributes = Object.keys(shared.mesh.geometry.attributes).sort();
  Check("批次几何只带 position + normal", JSON.stringify(attributes) === JSON.stringify(["normal", "position"]), JSON.stringify(attributes));
  const matrix = new THREE.Matrix4();
  shared.mesh.getMatrixAt(batch.records.get(wallB).instanceId, matrix);
  Check("实例矩阵 = 成员 matrixWorld", matrix.equals(wallB.matrixWorld));
  const blend = [...batch.groups.values()].find((g) => g.objects.includes(trench));
  Check("地形融合接收组的材质带标记", blend.mesh.material.userData.terrainBlendReceiver === true);
  const damage = [...batch.groups.values()].find((g) => g.objects.includes(sink));
  const enabled = { value: 0 };
  const override = { userData: { damageObjectEnabled: enabled } };
  damage.mesh.onBeforeRender({}, scene, new THREE.PerspectiveCamera(), damage.mesh.geometry, override);
  const during = enabled.value;
  damage.mesh.onAfterRender({}, scene, null, damage.mesh.geometry, override);
  Check("破口组的 draw 前后开关裁切（逐成员剔除照跑）", during === 1 && enabled.value === 0, `${during}/${enabled.value}`);
  Check("合批不投影、平时藏着", [...batch.groups.values()].every((g) => !g.mesh.castShadow && !g.mesh.visible));
  Check("成员属性一个不改", wallA.visible && trench.visible && sink.visible && wallA.castShadow === false);
}

// 预通道那一刻换人；烘阴影那一刻成员还回来
const seen = [];
const shadowMap = { render(lights, sceneArg) { seen.push({ wallA: wallA.visible, sink: sink.visible, batch: batch.live.every((g) => g.mesh.visible) }); } };
const renderer = { shadowMap };
Check("包装装上、重复安装幂等", InstallPrepassStaticBatch(renderer, batch) && !InstallPrepassStaticBatch(renderer, batch));
const noted = [];
Frame();
batch.BeginPrepass((object) => noted.push(object.name));
const inPrepass = { wallA: wallA.visible, sink: sink.visible, batch: batch.live.every((g) => g.mesh.visible) };
shadowMap.render([{}], scene, null);
const afterShadow = { wallA: wallA.visible, sink: sink.visible };
batch.EndPrepass();
Check("预通道里：合批打开、成员藏起", inPrepass.batch && !inPrepass.wallA && !inPrepass.sink, JSON.stringify(inPrepass));
Check("烘阴影那一刻成员还回来", seen.at(-1).wallA && seen.at(-1).sink, JSON.stringify(seen.at(-1)));
Check("烘完再藏回去", !afterShadow.wallA && !afterShadow.sink, JSON.stringify(afterShadow));
Check("画完原样还原", wallA.visible && sink.visible && batch.live.every((g) => !g.mesh.visible));
Check("每个成员都刷了速度历史", JSON.stringify(noted.sort()) === JSON.stringify(STILL), JSON.stringify(noted));
shadowMap.render([{}], scene, null);
Check("不在预通道里就是直通", seen.at(-1).wallA && !seen.at(-1).batch);

// 变化当帧踢出、冷却后重收
Frame(() => { wallB.position.y = 1; });
Check("移动：当帧踢出", !members().includes("wallB") && batch.stats.evictions === 1);
{
  const shared = [...batch.groups.values()].find((g) => g.objects.includes(wallA));
  Check("共用几何引用数跟着减", shared.geometries.get(box).refs === 2);
}
Frame(() => { trench.material = plain; });
Check("换材质：当帧踢出", !members().includes("trench"));
Frame(() => { blendMaterial.userData.terrainBlendReceiver = false; });
Frame(() => { wallA.visible = false; });
Check("被藏：当帧踢出", !members().includes("wallA"));
Frame(() => { wallA.visible = true; sink.geometry.attributes.normal.needsUpdate = true; });
Check("法线改了：当帧踢出", !members().includes("sink"));
for (let i = 0; i < 20; i += 1) Frame();
Check("冷却后重新收（停下来的也收）", JSON.stringify(members()) === JSON.stringify(["leaf", "moving", "sink", "trench", "wallA", "wallB"]), JSON.stringify(members()));
Check("镜像件永不收", !members().includes("mirrored"));
Frame(() => { scene.remove(wallB); });
Check("摘出场景：当帧踢出并忘掉", !members().includes("wallB") && !batch.records.has(wallB));

// 关掉全还原
batch.SetEnabled(false);
Frame();
Check("关掉后合批撤掉", batch.groups.size === 0 && batch.root.children.length === 0 && batch.live.length === 0);
batch.BeginPrepass(); Check("关着时预通道不换人", wallA.visible && !batch.hiding); batch.EndPrepass();
batch.SetEnabled(true);

// Prime：不等静止帧一次收满，排除子树不收，之后逐帧对账照常
{
  const fresh = new THREE.Scene();
  const a = Mesh("primeA", 0, { parent: fresh }), b = Mesh("primeB", 3, { parent: fresh });
  const warm = new THREE.Group(); fresh.add(warm);
  Mesh("primeProxy", 6, { parent: warm });
  const primed = new PrepassStaticBatch(fresh, { tuning: { ...TUNING, settleFrames: 1000, joinBudgetMs: 0 } });
  fresh.updateMatrixWorld();
  const joined = primed.Prime({ exclude: warm });
  const names = [...primed.groups.values()].flatMap((g) => g.objects.map((o) => o.name)).sort();
  Check("Prime：一次收满、排除子树不收", joined === 2 && JSON.stringify(names) === JSON.stringify(["primeA", "primeB"]), `${joined} ${JSON.stringify(names)}`);
  fresh.updateMatrixWorld(); primed.Update();
  Check("Prime 之后静止的不被踢", primed.stats.members === 2 && primed.stats.evictions === 0);
  b.position.x = 4; fresh.updateMatrixWorld(); primed.Update();
  Check("Prime 之后变化当帧踢出", primed.stats.members === 1 && primed.stats.evictions === 1);
  Check("Prime 不动成员属性", a.visible && b.visible);
}

console.log(failed ? `FAIL ${failed} 项` : "PASS PrepassStaticBatch：只收稳定的不透明叶子、按破口 × 地形融合分组、预通道那一刻换人且烘阴影时还原、速度历史照记、变化当帧踢出、Prime 一次收满");
process.exit(failed ? 1 : 0);
