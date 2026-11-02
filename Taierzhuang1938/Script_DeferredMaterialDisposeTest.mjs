// Script_DeferredMaterialDispose 的纯 Node 回归（真 three 材质，数 dispose 事件）：
//
//   1. Collect 包着的同步调用里 material.dispose() 只记下、不发 dispose 事件；各种材质子类都截得到；
//   2. Collect 结束（含抛错）原型上的 dispose 原样还回去，之后照常释放；嵌套也还对；
//   3. Flush 真释放记下的材质，同一只记两次只放一次；inUse 里的跳过、不再挂着；清空后再 Flush 什么都不做。
//
// 用法：node Taierzhuang1938/Script_DeferredMaterialDisposeTest.mjs

import * as THREE from "three";
import { DeferredMaterialDispose } from "./Script_DeferredMaterialDispose.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

const disposeCounts = new Map();
function Track(material) {
  disposeCounts.set(material, 0);
  material.addEventListener("dispose", () => disposeCounts.set(material, disposeCounts.get(material) + 1));
  return material;
}
const original = Object.getOwnPropertyDescriptor(THREE.Material.prototype, "dispose");
const Restored = () => Object.getOwnPropertyDescriptor(THREE.Material.prototype, "dispose")?.value === original.value;

// 1. 截住
{
  const retired = new DeferredMaterialDispose();
  const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial(),
    new THREE.ShaderMaterial(), new THREE.MeshDepthMaterial()].map(Track);
  const result = retired.Collect(() => { for (const material of materials) material.dispose(); return 7; });
  Check("Collect 返回 fn 的返回值", result === 7, String(result));
  Check("Collect 里的 dispose 一个事件都不发", materials.every((material) => disposeCounts.get(material) === 0),
    materials.map((material) => disposeCounts.get(material)).join(","));
  Check("四种材质子类都记下了", retired.pending.size === 4, String(retired.pending.size));
  Check("Collect 结束原型还原", Restored());
  const flushed = retired.Flush();
  Check("Flush 真释放，每只一次", materials.every((material) => disposeCounts.get(material) === 1)
    && flushed.disposed === 4 && flushed.kept === 0, JSON.stringify(flushed));
}

// 2. 抛错 / 嵌套 / 之后照常
{
  const retired = new DeferredMaterialDispose();
  const material = Track(new THREE.MeshStandardMaterial());
  let threw = false;
  try { retired.Collect(() => { material.dispose(); throw new Error("teardown failed"); }); }
  catch { threw = true; }
  Check("fn 抛错照样往外抛", threw);
  Check("抛错后原型还原", Restored());
  Check("抛错前那次 dispose 仍记着", retired.pending.has(material) && disposeCounts.get(material) === 0);
  const inner = Track(new THREE.MeshBasicMaterial()), outer = Track(new THREE.MeshBasicMaterial());
  retired.Collect(() => { retired.Collect(() => inner.dispose()); outer.dispose(); });
  Check("嵌套 Collect：内层结束后外层仍在截", disposeCounts.get(outer) === 0 && retired.pending.has(outer));
  Check("嵌套 Collect 结束原型还原", Restored());
  const plain = Track(new THREE.MeshStandardMaterial());
  plain.dispose();
  Check("Collect 外面的 dispose 照常发事件", disposeCounts.get(plain) === 1);
  retired.Flush();
}

// 3. 重复 / inUse / 清空
{
  const retired = new DeferredMaterialDispose();
  const shared = Track(new THREE.MeshStandardMaterial()), owned = Track(new THREE.MeshStandardMaterial());
  retired.Collect(() => { shared.dispose(); owned.dispose(); owned.dispose(); });
  Check("同一只记两次只算一只", retired.pending.size === 2, String(retired.pending.size));
  const flushed = retired.Flush(new Set([shared]));
  Check("inUse 里的跳过，其余释放一次", disposeCounts.get(shared) === 0 && disposeCounts.get(owned) === 1
    && flushed.disposed === 1 && flushed.kept === 1, JSON.stringify(flushed));
  Check("Flush 后清空", retired.pending.size === 0);
  const again = retired.Flush();
  Check("再 Flush 什么都不做", again.disposed === 0 && again.kept === 0 && disposeCounts.get(owned) === 1);
}

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
