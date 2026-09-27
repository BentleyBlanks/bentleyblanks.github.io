// Script_PrepassSkipTest.mjs —— 预通道「藏出这一趟」分类的增量重建（纯 Node，真 three 对象，不起浏览器）
//
// PrepassPass._CollectSkipped 的分类缓存按 scene 的顶层子树各记一份：结构一变只重分类
// 那一棵（2026-09-27 开场近爆那几帧每次结构变化都整场 traverse）。这里验：
//   1. 随机挂 / 摘网格、摘挂整个人、在人之间挪节点、改 skipNormalDepth 后再动结构，
//      增量结果（always / ranged / skinned 三类）与同一时刻整场重建逐个相同；
//   2. 一处结构变化只标它那一棵顶层子树；
//   3. 前景根（foregroundPrepassRoot）下的半透明件仍进 always，挪出前景根后不再算前景。
//
// 用法：node Taierzhuang1938/Script_PrepassSkipTest.mjs

import * as THREE from "three";
import { PrepassPass } from "./Script_PostPrepass.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

/** 只装分类要用的那几样字段，不建渲染靶（构造函数要 renderer）。 */
function MakeClassifier() {
  const pass = Object.create(PrepassPass.prototype);
  Object.assign(pass, {
    velocityEnabled: true, _skipScratch: [], _skipAlways: [], _skipRanged: [], _skipSkinned: [],
    _skipScene: null, _skipDirty: true, _skipMarkStamp: -1, _skipVelocity: null, _skipWatched: new WeakSet(),
    _skipTops: new Map(), _skipDirtyTops: new Set(), _foregroundObjects: new WeakSet(),
    _skipWorldPosition: new THREE.Vector3(), _skeletons: new Set(),
  });
  pass._OnSceneStructure = (event) => pass._SkipStructureChanged(event);
  return pass;
}

const Solid = () => new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshStandardMaterial());
const Glow = () => { const m = new THREE.MeshBasicMaterial({ transparent: true }); m.allowOverride = false; return new THREE.Mesh(new THREE.PlaneGeometry(.1, .1), m); };
function Person(name) {
  const root = new THREE.Group(); root.name = name;
  const bone = new THREE.Bone(); root.add(bone);
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(.4, 1.7, .3), new THREE.MeshStandardMaterial());
  skin.bind(new THREE.Skeleton([bone])); root.add(skin);
  const cap = Solid(); cap.userData.normalDepthMaxDistance = 30; bone.add(cap);
  return root;
}

const scene = new THREE.Scene();
const people = Array.from({ length: 5 }, (_, i) => Person("P" + i));
for (const p of people) scene.add(p);
const sky = Solid(); sky.userData.skipNormalDepth = true; scene.add(sky);
const hands = new THREE.Group(); hands.userData.foregroundPrepassRoot = true; scene.add(hands);
const flash = new THREE.Mesh(new THREE.PlaneGeometry(.1, .1), new THREE.MeshBasicMaterial({ transparent: true })); hands.add(flash);

const inc = MakeClassifier();
const Classes = (pass) => ({ always: new Set(pass._skipAlways), ranged: new Set(pass._skipRanged), skinned: new Set(pass._skipSkinned) });
const Same = (a, b) => ["always", "ranged", "skinned"].every((k) => a[k].size === b[k].size && [...a[k]].every((o) => b[k].has(o)));
inc._CollectSkipped(scene);
Check("首帧：天空、前景半透明件进 always", inc._skipAlways.includes(sky) && inc._skipAlways.includes(flash));

let seed = 11;
const Rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const Pick = (list) => list[Math.floor(Rand() * list.length)];
const hung = [];
let bad = 0, detail = "";
for (let step = 0; step < 300; step++) {
  const person = Pick(people), node = Pick(person.children.concat(person.children.flatMap((c) => c.children))), op = Rand();
  if (op < .3) { const m = Rand() < .5 ? Solid() : Glow(); if (Rand() < .3) m.userData.skipNormalDepth = true; if (Rand() < .3) m.userData.normalDepthMaxDistance = 20; node.add(m); hung.push(m); }
  else if (op < .5 && hung.length) hung.splice(Math.floor(Rand() * hung.length), 1)[0].removeFromParent();
  else if (op < .7) { if (person.parent) scene.remove(person); else scene.add(person); }
  else if (op < .8 && hung.length) Pick(people).attach(Pick(hung));
  else if (op < .9 && hung.length) hands.add(Pick(hung));
  else { const extra = Person("X" + step); people.push(extra); scene.add(extra); }
  if (Rand() < .5) inc._CollectSkipped(scene);
  if (step % 10 !== 9) continue;
  inc._CollectSkipped(scene);
  const full = MakeClassifier();
  full._CollectSkipped(scene);
  if (!Same(Classes(inc), Classes(full))) { bad++; detail ||= `step ${step}: inc ${JSON.stringify(Object.fromEntries(Object.entries(Classes(inc)).map(([k, v]) => [k, v.size])))} full ${JSON.stringify(Object.fromEntries(Object.entries(Classes(full)).map(([k, v]) => [k, v.size])))}`; }
}
Check("增量重分类与整场重建逐个相同（300 步随机增删 / 摘挂 / 挪进挪出前景根）", bad === 0, detail);

{
  const target = people.find((p) => p.parent === scene);
  inc._CollectSkipped(scene);
  target.children[0].add(Solid());
  Check("一处结构变化只标它那一棵顶层子树", !inc._skipDirty && inc._skipDirtyTops.size === 1 && inc._skipDirtyTops.has(target));
  inc._CollectSkipped(scene);
  Check("重分类后清掉标记", inc._skipDirtyTops.size === 0);
}
{
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(.1, .1), new THREE.MeshBasicMaterial({ transparent: true }));
  hands.add(glass); inc._CollectSkipped(scene);
  const inFront = inc._skipAlways.includes(glass);
  const holder = people.find((p) => p.parent === scene);
  holder.add(glass); inc._CollectSkipped(scene);
  Check("前景根下的半透明件进 always，挪出去后不再按前景算", inFront && !inc._skipAlways.includes(glass) && glass.userData.foregroundPrepass === false);
}

console.log(failed ? `FAIL ${failed} 项` : "PASS PrepassSkip：顶层子树增量重分类与整场重建一致、只标变了的那棵、前景继承跟着结构走");
process.exit(failed ? 1 : 0);
