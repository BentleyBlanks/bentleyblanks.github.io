// 03–06 说话手势 clip 的浏览器审片：正式 GLB（LugouNra02 / LugouNra05）+ 运行时装载链（Script_Actor + CharacterModel），
// 把每条手势 clip 以权重 1 叠在说话人实际会有的身体姿态上（左手 clip：蹲姿持汉阳造 crouchIdle；右手 clip：坐姿不持枪
// lifePose.sit），逐帧量：
//   1) 没有 NaN：手势臂、脊柱的世界矩阵都是有限数；
//   2) 手臂不进躯干：运行时 CPU 蒙皮，手势那条胳膊（前臂、手、手指）的顶点落在躯干皮肤（骨盆、脊柱、颈；ToMouth 另算头）
//      里面多深 ≤ 2.5 cm（衣服、低模的厚度；bake 在直立身体上量的是 ≤ 2 cm）；
//   3) 左手手势不穿枪：枪按基础姿态挂好（Step 3 的 Actor 钩子就是让枪停在这里），手势保持段里
//      左前臂、左手、手指的顶点离枪身三角形 ≥ 1 cm；
//   4) 指向类的实际方向（肩→手）与 bake 的 strokeDir 差多少：只报告（蹲、坐时胸口朝向不同，瞄准由运行时层做）。
// 用法：node Taierzhuang1938/Script_SpeakerGestureClipsBrowserTest.mjs [--shots] [--clip=名字,名字]
//   --shots 另存审片图到 <仓库>/tmp/SpeakerGestureReview/（起手、重音、保持中段各一张：正面、手势侧、45° 俯视、对话者视角），不进仓库。
// 这里只把 clip 本身叠上去（权重 1，不经 Step 3 的手势层与淡入淡出），回答「手势资产在正式骨架上对不对」。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shots = process.argv.includes("--shots");
const only = (process.argv.find(arg => arg.startsWith("--clip="))?.slice(7) || "").split(",").filter(Boolean);
const outDir = path.join(rootDir, "tmp", "SpeakerGestureReview");
if (shots) fs.mkdirSync(outDir, { recursive: true });
// head: a hand brought to the mouth rests its fingers on the lips (a few cm of the low-poly face give way);
// no other clip comes near the head.
const LIMIT = { torsoM: .025, headM: .03, headContactM: .045, rifleM: .01 };
const RIGS = ["LugouNra02", "LugouNra05"];

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const W = 480, H = 540;
const page = await browser.newPage({ viewport: { width: W * 2, height: H * 2 }, deviceScaleFactor: 1 });
let failed = 0;
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&poseShot=1&phase=0&quality=high`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  const clips = await page.evaluate(async ({ W, H }) => {
    const T = window.Taierzhuang, THREE = await import("three");
    const api = await import("./Script_SpeakerGestureClips.mjs");
    const library = await api.LoadSpeakerGestureClips();
    T.actorFactory.SetBatcher?.(null);
    T.state.menu = false; T.state.running = false;
    for (const id of ["hud", "menu", "boot"]) document.getElementById(id)?.style.setProperty("display", "none", "important");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202226);
    scene.add(new THREE.HemisphereLight(0xdad6cc, 0x2a2a30, 2.4));
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2); key.position.set(-3, 6, 4); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .42, .4), new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1 }));
    scene.add(seat);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 30);
    const eye = new THREE.PerspectiveCamera(55, W / H, .05, 30);
    const N = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const V = () => new THREE.Vector3();
    const s = window.speakerGestureReview = { T, THREE, api, library, scene, actors: new Map(), seat };
    // One actor per rig and posture, reused by every clip on it.
    s.Actor = (rig, hand) => {
      const id = rig + hand;
      if (s.actors.has(id)) return s.actors.get(id);
      const modelVariant = Number(rig.slice(-2)) - 1;
      const actor = T.actorFactory.Create("nra", { modelVariant, weapon: hand === "L" ? "HanYang" : null, seed: 5200 + modelVariant, sizeScale: 1 });
      scene.add(actor.root); actor.root.visible = true;
      const rigObj = actor.characterRig;
      const skinned = []; actor.root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      const own = hand.toLowerCase();
      const armRe = new RegExp(`^bip\\d+${own}(forearm|hand|finger\\d*)$`);
      const torsoRe = /^bip\d+(pelvis|spine\d?|neck)$/, headRe = /^bip\d+head$/;
      // Vertices by dominant-weight bone: the gesture arm, the torso, the head.
      const sets = { arm: [], torso: [], head: [] };
      for (const mesh of skinned) {
        const si = mesh.geometry.getAttribute("skinIndex"), sw = mesh.geometry.getAttribute("skinWeight");
        if (!si || !sw) continue;
        const names = mesh.skeleton.bones.map(b => N(b.name));
        for (let i = 0; i < si.count; i++) {
          const w = { };
          for (let c = 0; c < 4; c++) { const b = names[si.getComponent(i, c)]; w[b] = (w[b] || 0) + sw.getComponent(i, c); }
          let arm = 0, torso = 0, head = 0;
          for (const [b, x] of Object.entries(w)) { if (armRe.test(b)) arm += x; else if (torsoRe.test(b)) torso += x; else if (headRe.test(b)) head += x; }
          if (arm > .5) sets.arm.push([mesh, i]); else if (torso > .5) sets.torso.push([mesh, i]); else if (head > .5) sets.head.push([mesh, i]);
        }
      }
      const e = { rig, hand, actor, rigObj, skinned, sets, clock: 0, gBones: new Map(), q: [], q0: [], weapon: actor.weaponMesh || actor.weapon || null,
        state: hand === "L" ? { crouch: 1, moveSpeed: 0, aim: 0 } : { lifePose: { sit: 1 }, moveSpeed: 0, aim: 0 } };
      s.actors.set(id, e);
      return e;
    };
    s.Base = (e, steps = 1) => { for (let i = 0; i < steps; i++) { e.clock += 1 / 30; e.actor.Update(1 / 30, Object.assign({ elapsed: e.clock }, e.state)); } };
    // Weight-1 overlay, the same composition the Step 3 layer uses: arm bones take the clip's local rotation, the
    // spine takes the clip's lean relative to its first frame on top of the body's own spine.
    const delta = new THREE.Quaternion();
    s.Overlay = (e, record, t) => {
      const bones = e.gBones.get(record) || (e.gBones.set(record, api.BindSpeakerGestureBones(e.rigObj.root, record)), e.gBones.get(record));
      api.SampleSpeakerGesture(record, t, e.q); api.SpeakerGestureFirstFrame(record, e.q0);
      bones.forEach((bone, k) => {
        if (!bone) return;
        if (record.spine[k]) bone.quaternion.multiply(delta.copy(e.q0[k]).invert().multiply(e.q[k]));
        else bone.quaternion.copy(e.q[k]);
      });
      e.actor.root.updateMatrixWorld(true);
      // A reach clip (ToMouth) re-aims the arm so its grip lands on the rig's anchor on the live head (the body
      // clip and the head layer turn the head); weight ramps in from the lift to the stroke and out after outS.
      const spec = record.spec;
      if (spec?.reach) {
        const anchor = api.SpeakerGestureAnchor(e.rig, spec.reach), head = e.rigObj.bones.head;
        const w = Math.min(Math.max(0, (t - spec.inS) / Math.max(.01, spec.strokeS - spec.inS)), 1, Math.max(0, 1 - (t - spec.outS) / .15));
        const find = key => bones[record.keys.indexOf(key)];
        const side = record.hand.toLowerCase(), prefix = record.keys[0].match(/^bip[0-9]+/)[0];
        const upper = find(prefix + side + "upperarm"), fore = find(prefix + side + "forearm"), hand = find(prefix + side + "hand");
        const roots = [1, 2, 3, 4].map(i => find(prefix + side + "finger" + i)).filter(Boolean);
        if (anchor && head && upper && w > 0) e.reachError = api.ReachSpeakerGestureAnchor(upper, fore, hand, roots, head, anchor, w);
        e.actor.root.updateMatrixWorld(true);
      }
      for (const mesh of e.skinned) mesh.skeleton.update();
      return bones;
    };
    const P = V(), Q = V(), NRM = V();
    s.Skin = ([mesh, i], out) => {
      out.fromBufferAttribute(mesh.geometry.getAttribute("position"), i); mesh.applyBoneTransform(i, out); return out.applyMatrix4(mesh.matrixWorld);
    };
    s.SkinNormal = ([mesh, i], p, out) => {
      out.fromBufferAttribute(mesh.geometry.getAttribute("position"), i)
        .addScaledVector(NRM.fromBufferAttribute(mesh.geometry.getAttribute("normal"), i), .01);
      mesh.applyBoneTransform(i, out); out.applyMatrix4(mesh.matrixWorld);
      return out.sub(p).normalize();
    };
    // Deepest gesture-arm vertex inside the torso (and head) skin: nearest body vertex, signed along its normal.
    s.Depth = (e, region) => {
      const body = e.sets[region];
      const bp = body.map(v => s.Skin(v, V())), bn = body.map((v, k) => s.SkinNormal(v, bp[k], V()));
      let worst = 0;
      for (let a = 0; a < e.sets.arm.length; a += 2) {
        s.Skin(e.sets.arm[a], P);
        let best = Infinity, at = -1;
        for (let k = 0; k < bp.length; k++) { const d = bp[k].distanceToSquared(P); if (d < best) { best = d; at = k; } }
        if (at < 0 || best > .05 * .05) continue;
        const depth = -Q.copy(P).sub(bp[at]).dot(bn[at]);
        if (depth > worst) worst = depth;
      }
      return worst;
    };
    // Closest gesture-arm vertex to the visible weapon triangles.
    const tri = new THREE.Triangle(), C = V();
    s.RifleGap = (e) => {
      const weapon = e.actor.weaponGroup || e.actor.weaponMesh || e.actor.weapon;
      if (!weapon?.traverse) return null;
      weapon.updateWorldMatrix(true, true);
      const tris = [];
      weapon.traverse(o => {
        if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
        const a = o.geometry.getAttribute("position"), index = o.geometry.getIndex(), count = index ? index.count : a.count;
        for (let i = 0; i + 2 < count; i += 3) tris.push([0, 1, 2].map(j => V().fromBufferAttribute(a, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld)));
      });
      if (!tris.length) return null;
      let best = Infinity;
      for (let a = 0; a < e.sets.arm.length; a += 3) {
        s.Skin(e.sets.arm[a], P);
        for (const t of tris) { tri.set(t[0], t[1], t[2]); tri.closestPointToPoint(P, C); const d = C.distanceTo(P); if (d < best) best = d; }
      }
      return best;
    };
    s.Render = (e, record) => {
      const r = T.renderer, size = new THREE.Vector2(); r.getSize(size);
      const bones = e.rigObj.bones, chest = (bones.spine2 || bones.head || bones.pelvis).getWorldPosition(V());
      const side = record.hand === "L" ? 1 : -1;
      r.setScissorTest(true);
      const views = [[V().set(0, .15, -3.2), 0, ortho], [V().set(-3.2 * side, .15, -.3), 1, ortho], [V().set(-1.6 * side, 2.2, -2.2), 2, ortho],
        [V().set(.35, .45, -2.4), 3, eye]];
      for (const [offset, slot, camera] of views) {
        if (camera.isOrthographicCamera) {
          const span = 1.7; camera.left = -span * W / H / 2; camera.right = span * W / H / 2; camera.top = span * .55; camera.bottom = -span * .45;
        }
        camera.updateProjectionMatrix();
        camera.position.copy(chest).add(offset); camera.lookAt(chest.x, chest.y - .05, chest.z); camera.updateMatrixWorld(true);
        const x = (slot % 2) * W, y = size.y - H * (1 + (slot >> 1));
        r.setViewport(x, y, W, H); r.setScissor(x, y, W, H);
        r.render(scene, camera);
      }
      r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
    };
    return Object.values(library.manifest.clips).length ? Object.entries(library.manifest.clips).map(([name, c]) => ({ name, ...c })) : [];
  }, { W, H });

  const rows = [];
  for (const rig of RIGS) for (const clip of clips) {
    if (only.length && !only.includes(clip.name)) continue;
    const row = await page.evaluate(({ rig, clip }) => {
      const s = window.speakerGestureReview, THREE = s.THREE;
      const record = s.api.SpeakerGestureClip(rig, clip.name);
      const e = s.Actor(rig, clip.hand);
      for (const [id, other] of s.actors) other.actor.root.visible = other === e;
      s.seat.visible = clip.hand === "R";
      s.Base(e, 40);                                   // settle the base clip
      const pelvis = e.rigObj.bones.pelvis.getWorldPosition(new THREE.Vector3());
      s.seat.position.set(pelvis.x, .21, pelvis.z + .12);
      const out = { rig, clip: clip.name, hand: clip.hand, finite: true, torsoM: 0, torsoAt: null, headM: 0, headAt: null, rifleM: Infinity, rifleAt: null, aimErrDeg: null, frames: 0 };
      const fps = record.fps, count = record.frameCount;
      for (let f = 0; f < count; f++) {
        const t = f / fps;
        s.Base(e);
        const bones = s.Overlay(e, record, t);
        out.frames++;
        for (const bone of bones) if (bone && !bone.matrixWorld.elements.every(Number.isFinite)) out.finite = false;
        const live = t >= clip.inS && t <= clip.outS;
        if (live && f % 2 === 0) {
          const d = s.Depth(e, "torso");
          if (d > out.torsoM) { out.torsoM = d; out.torsoAt = +t.toFixed(2); }
          const h = s.Depth(e, "head");
          if (h > out.headM) { out.headM = h; out.headAt = +t.toFixed(2); }
        }
        if (clip.hand === "L" && t >= clip.strokeS && t <= clip.outS && f % 3 === 0) {
          const g = s.RifleGap(e);
          if (g !== null && g < out.rifleM) { out.rifleM = g; out.rifleAt = +t.toFixed(2); }
        }
        if (clip.aim && Math.abs(t - clip.strokeS) < .5 / fps) {
          const own = clip.hand === "L" ? "L" : "R";
          const find = re => { let b = null; e.rigObj.root.traverse(n => { if (n.isBone && re.test(n.name)) b = n; }); return b; };
          const shoulder = find(new RegExp(`${own}_?UpperArm$`)), hand = find(new RegExp(`${own}_?Hand$`));
          if (shoulder && hand) {
            const d = hand.getWorldPosition(new THREE.Vector3()).sub(shoulder.getWorldPosition(new THREE.Vector3())).normalize();
            const q = e.actor.root.getWorldQuaternion(new THREE.Quaternion()).invert();
            d.applyQuaternion(q);
            out.aimErrDeg = +(d.angleTo(new THREE.Vector3().fromArray(record.strokeDir)) * 180 / Math.PI).toFixed(1);
          }
        }
      }
      if (out.rifleM === Infinity) out.rifleM = null;
      return out;
    }, { rig, clip });
    const headLimit = clip.reach === "mouth" ? LIMIT.headContactM : LIMIT.headM;
    const bad = !row.finite || row.torsoM > LIMIT.torsoM || row.headM > headLimit || (row.rifleM !== null && row.rifleM < LIMIT.rifleM);
    if (bad) failed++;
    rows.push(row);
    console.log(`${bad ? "FAIL" : "ok  "} ${row.clip.padEnd(16)} ${rig} ${row.hand} frames ${row.frames} finite ${row.finite}`
      + ` torso ${(row.torsoM * 100).toFixed(1)} cm @${row.torsoAt ?? "-"} head ${(row.headM * 100).toFixed(1)} cm @${row.headAt ?? "-"}`
      + (row.rifleM !== null ? ` rifle gap ${(row.rifleM * 100).toFixed(1)} cm @${row.rifleAt}` : "")
      + (row.aimErrDeg !== null ? ` stroke dir vs bake ${row.aimErrDeg} deg` : ""));
    if (shots) {
      for (const [label, t] of [["lift", clip.inS * .6], ["stroke", clip.strokeS], ["hold", (clip.hold[0] + clip.hold[1]) / 2]]) {
        await page.evaluate(({ rig, clip, t }) => {
          const s = window.speakerGestureReview, record = s.api.SpeakerGestureClip(rig, clip.name), e = s.Actor(rig, clip.hand);
          s.Base(e); s.Overlay(e, record, t); s.Render(e, record);
        }, { rig, clip, t });
        await page.screenshot({ path: path.join(outDir, `${clip.name}_${rig}_${label}.png`), clip: { x: 0, y: 0, width: W * 2, height: H * 2 } });
      }
    }
  }
  if (shots) fs.writeFileSync(path.join(outDir, "Data_SpeakerGestureReview.json"), JSON.stringify(rows, null, 2));
  assert.ok(rows.length > 0, "no gesture clip was reviewed");
  assert.equal(failed, 0, `${failed} speaker gesture clip checks failed`);
  console.log(`ok speaker gesture clips browser review: ${rows.length} clip x rig runs on production rigs`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
