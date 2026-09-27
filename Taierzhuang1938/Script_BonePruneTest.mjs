// Script_BonePrune 的纯 Node 回归（真 three 对象，不起浏览器）。
//
//   1. 只剪「最上层、整棵子树没有可画物体」的骨头；挂着网格 / 灯的骨链保持可见；
//   2. 骨矩阵照算：藏起来的骨头 updateMatrixWorld 后世界矩阵与不剪时逐元素相同；
//   3. 挂点：往被剪的骨头（或它底下的空挂点）上加网格，结构事件把它标脏，下一次 Update 当帧恢复可见；
//      摘掉网格后重新剪；
//   4. 别人本来就藏着的骨头不碰，关掉时只还原自己藏的；
//   5. 结构不变时 Update 不重扫；整个人摘下场景时还原并忘掉，挂回后重新剪；
//   7. 只重扫变了的顶层子树：随机增删挂件 / 摘挂人物 / 跨人挪骨头之后，藏着的骨头与
//      「从头按规则算」的结果逐根相同，场景外的骨头全部还原。
//
// 用法：node Taierzhuang1938/Script_BonePruneTest.mjs

import * as THREE from "three";
import { BonePrune } from "./Script_BonePrune.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

/** 一具简化的人：hips → spine → chest → (neck → head) / (upperArmL → handL) / (upperArmR → handR)，另有腿。 */
function MakeRig(name) {
  const root = new THREE.Group(); root.name = name;
  const B = (n, parent, x = 0, y = .2) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, 0); parent.add(b); return b; };
  const hips = B("hips", root, 0, 1);
  const spine = B("spine", hips), chest = B("chest", spine), neck = B("neck", chest), head = B("head", neck);
  const armL = B("upperArmL", chest, -.2, 0), handL = B("handL", armL, -.3, 0);
  const armR = B("upperArmR", chest, .2, 0), handR = B("handR", armR, .3, 0);
  const thighL = B("thighL", hips, -.1, -.4), footL = B("footL", thighL, 0, -.4);
  const thighR = B("thighR", hips, .1, -.4), footR = B("footR", thighR, 0, -.4);
  const socket = new THREE.Object3D(); socket.name = "gripSocket"; handR.add(socket);
  const body = new THREE.SkinnedMesh(new THREE.BoxGeometry(.4, 1.7, .3), new THREE.MeshBasicMaterial());
  body.name = "body"; root.add(body);   // 蒙皮网格是骨架的兄弟，不在骨头底下（生产 GLB 就是这样）
  return { root, bones: { hips, spine, chest, neck, head, armL, handL, armR, handR, thighL, footL, thighR, footR }, socket };
}

const scene = new THREE.Scene();
const a = MakeRig("A"), b = MakeRig("B");
scene.add(a.root, b.root);
// B 的右手握着一支枪（网格挂在手骨上）
const rifle = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 1), new THREE.MeshBasicMaterial());
b.bones.handR.add(rifle);
// A 的胸骨上挂一盏灯（枪口焰那类）
const flash = new THREE.PointLight(); a.bones.head.add(flash);

const prune = new BonePrune();
Check("首帧重判", prune.Update(scene) === true);
const P = (rig) => Object.fromEntries(Object.entries(rig.bones).map(([k, v]) => [k, v.visible]));
{
  const pa = P(a), pb = P(b);
  // A：hips 底下有灯 → hips/spine/chest/neck/head 可见；手臂两条、腿两条各剪最上层那根
  Check("A 挂灯的骨链保持可见", pa.hips && pa.spine && pa.chest && pa.neck && pa.head, JSON.stringify(pa));
  Check("A 无物的手臂/腿只剪最上层", !pa.armL && !pa.armR && !pa.thighL && !pa.thighR && pa.handL && pa.handR && pa.footL && pa.footR, JSON.stringify(pa));
  Check("B 握枪那条臂保持可见", pb.armR && pb.handR, JSON.stringify(pb));
  Check("B 头颈、左臂、双腿被剪", !pb.neck && !pb.armL && !pb.thighL && !pb.thighR, JSON.stringify(pb));
  Check("剪掉的根数", prune.stats.roots === 4 + 4, `roots ${prune.stats.roots}`);
}

// 2. 骨矩阵照算
{
  a.bones.armL.rotation.set(.3, .2, .1); a.bones.handL.position.x = -.35;
  scene.updateMatrixWorld(true);
  const pruned = a.bones.handL.matrixWorld.clone();
  prune.SetEnabled(false);
  scene.updateMatrixWorld(true);
  const plain = a.bones.handL.matrixWorld.clone();
  Check("关掉剪枝时全部还原", Object.values(P(a)).every(Boolean) && Object.values(P(b)).every(Boolean));
  Check("被剪骨头的世界矩阵照算", pruned.equals(plain));
  prune.SetEnabled(true);
  prune.Update(scene);
}

// 3. 挂点：往被剪的空挂点（B 没有；用 A 的右手挂点）加网格
{
  Check("A 右臂被剪", a.bones.armR.visible === false);
  const knife = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .3), new THREE.MeshBasicMaterial());
  a.socket.add(knife);
  Check("结构事件标脏（只标那个人）", prune.Pending && !prune.dirty && prune.dirtyTops.size === 1 && prune.dirtyTops.has(a.root));
  prune.Update(scene);
  Check("挂上东西的骨链当帧恢复", a.bones.armR.visible && a.bones.handR.visible);
  knife.removeFromParent();
  prune.Update(scene);
  Check("摘掉后重新剪", a.bones.armR.visible === false);
}

// 4. 别人藏的骨头不碰
{
  prune.SetEnabled(false);
  b.bones.thighL.visible = false;       // 别人藏的（有意为之）
  prune.SetEnabled(true);
  prune.Update(scene);
  prune.SetEnabled(false);
  Check("关掉时别人藏的骨头保持藏着", b.bones.thighL.visible === false);
  b.bones.thighL.visible = true;
  prune.SetEnabled(true);
  prune.Update(scene);
}

// 5. 结构不变不重扫；整人摘下 / 挂回
{
  const scans = prune.stats.scans;
  Check("结构不变不重扫", prune.Update(scene) === false && prune.stats.scans === scans);
  scene.remove(b.root);
  prune.Update(scene);
  Check("摘下场景的人全部还原", Object.values(P(b)).every(Boolean), JSON.stringify(P(b)));
  // 摘下期间给它挂一支刺刀：挂回后那条骨链必须可见
  const bayonet = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .4), new THREE.MeshBasicMaterial());
  b.bones.handL.add(bayonet);
  scene.add(b.root);
  prune.Update(scene);
  Check("挂回后重新剪、新挂件那条臂可见", b.bones.armL.visible && b.bones.handL.visible && !b.bones.neck.visible, JSON.stringify(P(b)));
}

// 6. 换场景：旧场景的骨头还原
{
  const other = new THREE.Scene();
  prune.Update(other);
  Check("换场景时还原上一场景自己藏的骨头", Object.values(P(a)).every(Boolean) && Object.values(P(b)).every(Boolean));
}

// 7. 顶层子树增量重判 vs 从头按规则算
{
  const world = new THREE.Scene(), rigs = [];
  for (let i = 0; i < 6; i++) { const r = MakeRig("R" + i); rigs.push(r); world.add(r.root); }
  const props = new THREE.Group(); props.name = "props"; world.add(props);
  const inc = new BonePrune();
  inc.Update(world);
  let seed = 7;
  const Rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const Pick = (list) => list[Math.floor(Rand() * list.length)];
  const hung = [];
  // 期望：整棵子树不可画、且父节点不是「同样整棵不可画的骨头」的骨头
  const Renderable = (o) => !!(o.isMesh || o.isLine || o.isPoints || o.isSprite || o.isLight || o.isLOD) || o.children.some(Renderable);
  const Expected = (root) => { const out = new Set(); root.traverse((o) => { if (o.isBone && !Renderable(o) && !(o.parent?.isBone && !Renderable(o.parent))) out.add(o); }); return out; };
  let bad = 0, scans = 0, detail = "";
  for (let step = 0; step < 400; step++) {
    const r = Pick(rigs), bone = Pick(Object.values(r.bones)), op = Rand();
    if (op < .35) { const m = new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), new THREE.MeshBasicMaterial()); bone.add(m); hung.push(m); }
    else if (op < .6 && hung.length) hung.splice(Math.floor(Rand() * hung.length), 1)[0].removeFromParent();
    else if (op < .75) { if (r.root.parent) world.remove(r.root); else world.add(r.root); }
    else if (op < .85) { const empty = new THREE.Bone(); empty.name = "extra"; bone.add(empty); }
    else if (op < .92) { const other = Pick(rigs); const leaf = Pick(Object.values(other.bones)); if (!leaf.getObjectById(bone.id) && !bone.getObjectById(leaf.id)) leaf.attach(bone); }
    else props.add(new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), new THREE.MeshBasicMaterial()));
    if (Rand() < .6) { if (inc.Update(world)) scans++; }
    if (step % 10 !== 9) continue;
    inc.Update(world);
    const want = Expected(world), hidden = new Set();
    world.traverse((o) => { if (o.isBone && o.visible === false) hidden.add(o); });
    const miss = [...want].filter((o) => !hidden.has(o)).length, extra = [...hidden].filter((o) => !want.has(o)).length;
    let outside = 0;
    for (const rig of rigs) if (!rig.root.parent) rig.root.traverse((o) => { if (o.isBone && o.visible === false) outside++; });
    if (miss || extra || outside) { bad++; detail ||= `step ${step}: miss ${miss} extra ${extra} outsideHidden ${outside}`; }
  }
  Check("增量重判与从头按规则算逐根相同（400 步随机增删 / 摘挂 / 跨人挪骨头）", bad === 0, detail);
  if (!rigs[0].root.parent) world.add(rigs[0].root);
  inc.Update(world);
  // （骨头可能已被随机步骤挪到别人身上；挂一根新骨头到这个人的根上，再往它上面挂件）
  const socket = new THREE.Bone(); rigs[0].root.add(socket); inc.Update(world);
  const before = inc.stats.scans;
  socket.add(new THREE.Mesh(new THREE.BoxGeometry(.01, .01, .01), new THREE.MeshBasicMaterial()));
  Check("一处挂件只标它那一棵顶层子树", inc.dirtyTops.size === 1 && inc.dirtyTops.has(rigs[0].root) && !inc.dirty);
  inc.Update(world);
  Check("重判一次", inc.stats.scans === before + 1);
}

console.log(failed ? `FAIL ${failed} 项` : "PASS BonePrune：只剪整棵不可画的最上层骨头、矩阵照算、挂件当帧恢复、不碰别人藏的、摘下挂回自洽");
process.exit(failed ? 1 : 0);
