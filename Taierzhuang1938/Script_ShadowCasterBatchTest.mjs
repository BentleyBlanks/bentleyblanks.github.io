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

// 9. 大几何只重排完整三角：每个有向三角的 Float32 位模式、次数都不变。
{
  const fresh = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(160, 160, 32, 32);
  geometry.rotateX(-Math.PI / 2);
  const primed = new ShadowCasterBatch(fresh, { tuning: { ...TUNING, localChunkSize: 48, localChunkMinTriangles: 1024 } });
  const Triangles = (parts) => parts.flatMap((part) => {
    const position = part.attributes.position, index = part.index;
    const count = index ? index.count : position.count, result = [];
    const point = new Float32Array(3), bits = new Uint32Array(point.buffer);
    for (let i = 0; i < count; i += 3) {
      const corners = [];
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = index ? index.getX(i + corner) : i + corner;
        point[0] = position.getX(vertex); point[1] = position.getY(vertex); point[2] = position.getZ(vertex);
        corners.push(Array.from(bits).join(","));
      }
      result.push(corners.join(";"));
    }
    return result;
  }).sort();
  const sameTriangles = (a, b) => JSON.stringify(Triangles(a)) === JSON.stringify(Triangles(b));
  const prepared = primed._Geometry(geometry);
  Check("局部分块：大件分成多块、只带紧凑位置与索引", prepared.parts.length > 1 && prepared.parts.every((part) =>
    Object.keys(part.attributes).join() === "position" && new Set(part.index.array).size === part.attributes.position.count));
  Check("局部分块：索引三角的坐标位模式/绕序/次数完全一致", sameTriangles([geometry], prepared.parts));
  Check("局部分块：缓存重复使用、不再复制顶点", primed._Geometry(geometry) === prepared);
  const flat = geometry.toNonIndexed(), flatPrepared = primed._Geometry(flat);
  Check("局部分块：非索引三角完全一致", flatPrepared.parts.length > 1 && sameTriangles([flat], flatPrepared.parts));
  const points = geometry.attributes.position, interleaved = new THREE.BufferGeometry(), data = new Float32Array(points.count * 5);
  for (let i = 0; i < points.count; i += 1) { data[i * 5 + 1] = points.getX(i); data[i * 5 + 2] = points.getY(i); data[i * 5 + 3] = points.getZ(i); }
  interleaved.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, 5), 3, 1));
  interleaved.setIndex(geometry.index.clone());
  const interleavedPrepared = primed._Geometry(interleaved);
  Check("局部分块：交错属性三角完全一致", interleavedPrepared.parts.length > 1 && sameTriangles([interleaved], interleavedPrepared.parts));
  interleaved.attributes.position.data.needsUpdate = true;
  Check("局部分块：交错底层缓冲版本变化也重建缓存", primed._Geometry(interleaved) !== interleavedPrepared);
  const smallDense = new THREE.PlaneGeometry(10, 10, 32, 32);
  Check("局部分块：小件/低三角件保持一实例", primed._Geometry(smallDense).parts.length === 1 && primed._Geometry(boxGeometry).parts.length === 1);
  const disabled = new ShadowCasterBatch(fresh, { tuning: { ...TUNING, localChunkSize: 0 } });
  Check("局部分块：0 可恢复整件合批 A/B", disabled._Geometry(geometry).parts.length === 1);
  const a = new THREE.Mesh(geometry, plain), b = new THREE.Mesh(geometry, plain);
  a.castShadow = true; b.castShadow = true; b.position.set(4, 2, -3); b.rotation.y = .2; b.scale.set(1.5, 1.2, .9); fresh.add(a, b);
  const customMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }); customMaterial.shadowSide = THREE.BackSide;
  const c = new THREE.Mesh(geometry, customMaterial); c.customDepthMaterial = staticDepth; c.castShadow = true; fresh.add(c);
  primed.DisposeWarmProxy(primed.WarmProxy()); fresh.updateMatrixWorld();
  let resized = 0;
  const prototype = THREE.BatchedMesh.prototype;
  const originals = Object.fromEntries(["setGeometrySize", "setInstanceCount", "optimize"].map((name) => [name, prototype[name]]));
  try {
    for (const name of Object.keys(originals)) prototype[name] = function(...args) { resized += 1; return originals[name].apply(this, args); };
    primed.Prime();
  } finally { for (const name of Object.keys(originals)) prototype[name] = originals[name]; }
  const recA = primed.records.get(a), recB = primed.records.get(b), recC = primed.records.get(c), group = recA.group, entry = recA.geometryEntry;
  Check("局部分块：Prime 预留全部块的实例和真实顶点量、没有中途扩容/整理", resized === 0
    && group.mesh.instanceCount === 2 * prepared.parts.length && group.mesh.maxInstanceCount >= group.mesh.instanceCount);
  Check("局部分块：一源一登记、同源跨组复用缓存、每块矩阵一致", group.objects.length === 2 && group.geometries.size === 1
    && entry.refs === 2 && recA.instanceIds.length === prepared.parts.length && recC.geometryEntry.prepared === prepared
    && recB.instanceIds.every((id) => { const matrix = new THREE.Matrix4(); group.mesh.getMatrixAt(id, matrix); return matrix.elements.every((n, i) => Math.abs(n - b.matrixWorld.elements[i]) < 1e-6); }));
  Check("局部分块：自定义深度/面向保持一源一组", recC.group.mesh.customDepthMaterial === primed.depthClones.get(staticDepth)
    && recC.group.mesh.material.side === THREE.DoubleSide && recC.group.mesh.material.shadowSide === THREE.BackSide);
  // 同一顶点被跨块引用时，逐块包围球必须罩住它；这里直接跑 three 的原生阴影视锥登记。
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, .1, 200); camera.position.set(70, 100, 70); camera.lookAt(70, 0, 70); camera.updateMatrixWorld();
  group.mesh.onBeforeShadow(null, null, null, camera, group.mesh.geometry, group.mesh.customDepthMaterial);
  const submitted = Array.from(group.mesh._multiDrawCounts).slice(0, group.mesh._multiDrawCount).reduce((sum, count) => sum + count, 0);
  Check("局部分块：原生逐块视锥减少画面外三角", submitted > 0 && submitted < geometry.index.count * 2, `${submitted}/${geometry.index.count * 2}`);
  const oldIds = recB.instanceIds.slice(); b.position.y += 1; fresh.updateMatrixWorld(); primed.Update();
  Check("局部分块：移动当帧踢出整源全部实例、共享几何仍留", recB.instanceIds.length === 0 && group.mesh.instanceCount === prepared.parts.length
    && oldIds.every((id) => !group.mesh._instanceInfo[id].active) && entry.refs === 1 && group.geometries.get(geometry) === entry);
  a.visible = false; fresh.updateMatrixWorld(); primed.Update();
  Check("局部分块：最后一个共享源离开后全部几何 ID 释放", group.mesh.instanceCount === 0 && !group.geometries.has(geometry)
    && entry.ids.every((id) => !group.mesh._geometryInfo[id].active));
  const oldCustomIds = recC.instanceIds.slice(), customGroup = recC.group; geometry.attributes.position.needsUpdate = true; fresh.updateMatrixWorld(); primed.Update();
  const replaced = primed._Geometry(geometry);
  Check("局部分块：源版本变化当帧踢出全部实例并重建缓存", recC.group === null && oldCustomIds.every((id) => !customGroup.mesh._instanceInfo[id].active)
    && replaced !== prepared && sameTriangles([geometry], replaced.parts));
  const attribute = geometry.attributes.position.clone(); geometry.setAttribute("position", attribute);
  Check("局部分块：替换同版本属性也重建缓存", primed._Geometry(geometry) !== replaced);
  a.visible = true; for (let i = 0; i < 20; i += 1) { fresh.updateMatrixWorld(); primed.Update(); }
  Check("局部分块：冷却重收复用新版本、无孤儿实例", primed.stats.members === 3 && [...primed.groups.values()].reduce((sum, g) => sum + g.mesh.instanceCount, 0)
    === [...primed.records.values()].filter((rec) => rec.group).reduce((sum, rec) => sum + rec.instanceIds.length, 0));
  primed.SetEnabled(false);
  Check("局部分块：关闭后所有分块与源登记一起撤下", primed.records.size === 0 && primed.groups.size === 0 && primed.root.children.length === 0);
  primed.Dispose(); disabled.Dispose();
  for (const owned of [geometry, flat, interleaved, smallDense]) owned.dispose(); customMaterial.dispose();
}

// 10. 面向区间只剔除硬件 side 本来就不画的整块；逐三角符号 oracle 独立核对。
{
  const fresh = new THREE.Scene(), tuning = { ...TUNING, localChunkSize: 48, localChunkMinTriangles: 1024, localFacingCull: true };
  const geometry = new THREE.BoxGeometry(160, 8, 160, 32, 1, 32);
  const index = Array.from(geometry.index.array); index.push(0, 0, 0); geometry.setIndex(index);
  const object = new THREE.Mesh(geometry, plain); object.castShadow = true;
  object.position.set(420, 12, -110); object.rotation.set(.03, .173, -.021); object.scale.set(1.03, 1.2, .97); fresh.add(object);
  const primed = new ShadowCasterBatch(fresh, { tuning }); primed.DisposeWarmProxy(primed.WarmProxy()); fresh.updateMatrixWorld(); primed.Prime();
  const rec = primed.records.get(object), group = rec.group, mesh = group.mesh, prepared = rec.geometryEntry.prepared;
  const fakeDepth = new THREE.MeshDepthMaterial(), light = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const Submitted = (camera, enabled, side) => {
    tuning.localFacingCull = enabled; fakeDepth.side = side;
    mesh.onBeforeShadow(null, mesh, null, camera, mesh.geometry, fakeDepth);
    return new Set(Array.from(mesh._indirectTexture.image.data).slice(0, mesh._multiDrawCount));
  };
  let rejected = 0, invalid = 0, doubleChanged = 0, leaked = 0, degenerateRejected = 0;
  for (const perspective of [true, false]) for (const offset of [[0, 300, 0], [0, -300, 0], [300, 10, 0], [0, 0.00001, 300]]) {
    const camera = perspective ? new THREE.PerspectiveCamera(150, 1, .001, 20000) : new THREE.OrthographicCamera(-10000, 10000, 10000, -10000, .001, 20000);
    camera.position.copy(object.position).add(new THREE.Vector3(...offset)); camera.lookAt(object.position); camera.updateMatrixWorld();
    if (perspective) light.copy(camera.position).applyMatrix4(rec.inverse);
    else light.set(0, 0, 1).transformDirection(camera.matrixWorld).transformDirection(rec.inverse);
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      const original = Submitted(camera, false, side), visible = Submitted(camera, true, side);
      if (side === THREE.DoubleSide && [...original].some((id) => !visible.has(id))) doubleChanged += 1;
      for (let partId = 0; partId < rec.instanceIds.length; partId += 1) {
        const id = rec.instanceIds[partId];
        if (!original.has(id) || visible.has(id)) continue;
        rejected += 1;
        if (!prepared.facing[partId]) degenerateRejected += 1;
        const part = prepared.parts[partId], points = part.attributes.position, indices = part.index.array;
        for (let i = 0; i < indices.length; i += 3) {
          a.fromBufferAttribute(points, indices[i]); b.fromBufferAttribute(points, indices[i + 1]); c.fromBufferAttribute(points, indices[i + 2]);
          b.sub(a); c.sub(a); n.crossVectors(b, c);
          const sign = perspective ? n.dot(c.copy(light).sub(a)) : n.dot(light);
          if (side === THREE.FrontSide ? !(sign < 0) : !(sign > 0)) invalid += 1;
        }
      }
      if (rec.instanceIds.some((id) => !mesh.getVisibleAt(id))) leaked += 1;
    }
  }
  Check("面向剔除：透视/正交、非均匀缩放/旋转均无逐三角错误拒绝", rejected > 0 && invalid === 0, `reject ${rejected}, invalid ${invalid}`);
  Check("面向剔除：DoubleSide 完全不剔、所有实例可见性立即还原", doubleChanged === 0 && leaked === 0);
  Check("面向剔除：含退化三角的块保守保留", prepared.facing.some((bounds) => bounds === null) && degenerateRejected === 0);
  // 共面观察者、极近切线面都不能被 epsilon 边界误判；Front/Back 两面都保留这个平面。
  const flat = new THREE.PlaneGeometry(160, 160, 32, 32), plane = new THREE.Mesh(flat, plain); plane.castShadow = true; fresh.add(plane);
  fresh.updateMatrixWorld(); primed.Prime();
  const planeRec = primed.records.get(plane), camera = new THREE.PerspectiveCamera(150, 1, .001, 20000);
  camera.position.set(0, 0, 0.000001); camera.lookAt(0, 0, -1); camera.updateMatrixWorld();
  let ambiguousRejected = false;
  for (const side of [THREE.FrontSide, THREE.BackSide]) {
    const original = Submitted(camera, false, side), visible = Submitted(camera, true, side);
    ambiguousRejected ||= planeRec.instanceIds.some((id) => original.has(id) && !visible.has(id));
  }
  Check("面向剔除：近切线符号在保守误差区时两面都保留", !ambiguousRejected);
  const failureCamera = new THREE.PerspectiveCamera(150, 1, .001, 20000); failureCamera.position.copy(object.position).add(new THREE.Vector3(0, 300, 0)); failureCamera.lookAt(object.position); failureCamera.updateMatrixWorld();
  const originalSphere = mesh.getBoundingSphereAt; let threw = false;
  try {
    mesh.getBoundingSphereAt = () => { throw new Error("FacingHookOracle"); };
    Submitted(failureCamera, true, THREE.BackSide);
  } catch (error) { threw = error.message === "FacingHookOracle"; }
  finally { mesh.getBoundingSphereAt = originalSphere; }
  Check("面向剔除：原生钩子抛错后也立即还原实例", threw && [...primed.records.values()].every((record) => !record.group || record.instanceIds.every((id) => record.group.mesh.getVisibleAt(id))));
  const singular = new THREE.Mesh(geometry, plain); singular.castShadow = true; singular.scale.y = 1e-8; fresh.add(singular); fresh.updateMatrixWorld(); primed.Prime();
  const singularRec = primed.records.get(singular), singularBefore = Submitted(failureCamera, false, THREE.BackSide), singularAfter = Submitted(failureCamera, true, THREE.BackSide);
  Check("面向剔除：近奇异矩阵保守绕过", !singularRec.facingSafe && singularRec.instanceIds.every((id) => !singularBefore.has(id) || singularAfter.has(id)));
  primed.Dispose(); geometry.dispose(); flat.dispose(); fakeDepth.dispose();
}

console.log(failed ? `FAIL ${failed} 项` : "PASS ShadowCasterBatch：只收稳定叶子、烘焙那一刻换人并原样还原、变化当帧踢出、不改成员属性、关掉全还原、预热复用克隆、进关一次收满");
process.exit(failed ? 1 : 0);
