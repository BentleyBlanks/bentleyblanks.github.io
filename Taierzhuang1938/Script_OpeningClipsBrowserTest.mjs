// 01–02 开场动作库的浏览器审片：正式 GLB（五套骨架）+ 运行时装载链（InstallOpeningStoryboardAnimation）
// 逐条播放 2026-09-23 新做的 clip，量四样东西：
//   1) 脚滑：bake 声明的着地窗口（manifest models[].clips[].plants）里，脚踝与脚尖离窗口起点的最大位移 ≤ 2 cm；
//   2) 手部接触：成对 stage 按 manifest 的相对站位摆好双方，在 clip 声明的接触时刻量
//      施动者的握点（四根手指根的中心，与运行时 BuildHandGrip 同一个点）到对方皮肤接触点（沿法线外推
//      clip 元数据里的 standoffM：拳头指根离皮肤的厚度）的距离 ≤ 3 cm；
//      刀口类接触（刺刀割喉、大刀砍颈）量刀身网格到接触点的最近距离；
//   3) 骨长不变：每根骨头到父骨的世界距离 ÷ 绑定姿态距离，整条 clip 上与全身中位数相差 ≤ 1%；
//   4) 没有 NaN：骨骼世界矩阵、武器与道具的世界矩阵全是有限数。
//   5) 成对 stage 里人与人不穿插：粗胶囊（躯干、头、四肢，手不算）两两量最深的交叠；躯干/头对躯干/头 ≤ 3 cm，
//      带四肢的 ≤ 8 cm（胶囊把袖子裤腿都包进去了）。clip 声明了手去碰对方的那条胳膊，前臂不跟对方算。
//   6) 跪地的膝盖：bake 声明的膝盖着地窗口（kneePlants）里，膝关节离窗口起点的最大位移 ≤ 2 cm；
//   7) 贴墙：clip 声明的墙面接触（contacts 里 target:"wall"），那块皮肤（运行时 CPU 蒙皮的顶点）到 env 墙面的
//      距离在整个窗口里离墙 ≤ 3 cm、进墙 ≤ 3 cm；
//   8) 运行时行为：换 clip 时枪/刺刀跟着 0.28 s 的姿态混合走（不瞬移）、炸飞的枪留在地上不回手、
//      刺刀收鞘后挂在骨盆上、LuoKneelCheck 的 holdUntil 放开循环后播到底。
//   9) 抓第一人称玩家（2026-09-25 起）：clip 带 player 轨（collar / head / forearmR…）的，手在 grab/hold 窗口里
//      握点到 player 轨那一点 ≤ 3 cm；抓握臂长比（肩到目标点 ÷ 上臂+前臂+手到握点的绑定长度）≤ 1.05——
//      不许把胳膊锁直去够人；枪托砸头（limb butt → head）在接触时刻**枪托段**（枪的规范坐标系里离托底板 0.15 m
//      以内的三角形，Script_Actor 的 BuildWeaponGeometry：握把在原点、托底板在 z +0.255）到 player 头点（加 contact 的
//      playerOffsetM：眼位前上方的额头）≤ 3 cm——枪管或刺刀座擦过额头不算（只查声明了落点的；2026-09-23 的
//      IjaButtStrike 没声明，枪托到眼位 7.9 cm）。
//      伸手递向玩家（action reach，带 gapM：LuoKneelReach 的手停在胸口前 0.3 m）：窗口里握点到 player 轨那一点的距离
//      与 gapM 相差 ≤ 5 cm，臂长比同样 ≤ 1.05；手扶世界里的点（contact 带 pointM，演员坐标系运行时米：传令兵扶门柱）
//      在 [t, untilT] 里握点到那一点 ≤ 3 cm、臂长比 ≤ 1.05。
//  10) 单帧突跳（ROUND_0925 里的 clip）：任一骨头相邻两帧的世界旋转 > 25° 且大于前后两帧各自的 2.5 倍，算一跳。
//      基线就有的跳按「clip + 骨 + 时刻」逐条豁免（SPIKE_EXEMPT，写明出处），同一条 clip 别处的跳照样算。
//  8b) 上半身 clip（manifest upperBody:true，InterpreterHurryReach）导演不写 upperBody 时默认叠在原生腿上：
//      腿等于同一时钟下不放 clip 的原生走路，胳膊等于 clip 采样；显式 upperBody:false 时腿是 clip 自己的站姿。
//      导演要的 clip 这套骨架上没烘：退回原生动作，但按名字记一次（OpeningMissingClips / window.__openingMissingClips）。
// 用法：node Taierzhuang1938/Script_OpeningClipsBrowserTest.mjs [--shots] [--clip=名字,名字]
//   --shots 另存审片图到 <仓库>/tmp/OpeningClipsReview/（每条 clip 三帧 × 侧面/45° 俯视，每个 stage 的关键时刻），不进仓库。
// 演员一律 sizeScale:1（过场站位按原尺寸算到厘米；导演摆成对动作时也必须钉死 sizeScale）。
// 这里只放 clip 本身（不挂导演的表演层 SetOpeningActorPerformance），回答「动作资产在正式骨架上对不对」。
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
const outDir = path.join(rootDir, "tmp", "OpeningClipsReview");
if (shots) fs.mkdirSync(outDir, { recursive: true });
// overlap: torso/head against torso/head ≤ 3 cm; anything with a limb ≤ 8 cm (limb capsules carry
// the sleeve and trouser cloth and are round where a limb is not, so a hand-to-hand struggle reads
// a few cm deep without anything passing through).
const LIMIT = { footM: .02, kneeM: .02, wallM: .03, contactM: .03, boneRatio: .01, coreOverlapM: .03, limbOverlapM: .08,
  // while a clip change blends, a weapon or prop moves at most this far in the first 1/60 s step
  // (the old behaviour jumped 0.3-0.7 m there) and at most propStepM in any later step of the
  // 0.28 s blend (a 6 m/s swing: the blend itself plus the clip's own motion)
  propFirstM: .02, propStepM: .10,
  // 9) a hand on the first-person player: needed reach / bind-pose reach (shoulder -> grip point)
  reachRatio: 1.05,
  // 9) a hand held out toward the player (contact gapM): the distance to the player point within this of gapM
  reachGapM: .05,
  // 10) a one-frame spike: a bone's world rotation between two frames over jumpDeg and over
  // jumpRatio times both neighbouring steps
  jumpDeg: 25, jumpRatio: 2.5 };
// The storyboard round's clips (contract Data_FirstLevelStoryboard0103Contract.md §4.1): the spike
// check (10) runs on these; older clips were reviewed before it existed (IjaParriedChoppedFall, whose
// first frame this round re-authored, keeps the 2026-09-23 right-forearm snap at 0.83 s: 60° world,
// the same frame and size as before this round).
const ROUND_0925 = new Set(["IjaButtStrikeCollar", "IjaDragByForearm", "IjaLookBackLow", "IjaStartleTurn", "IjaGuardPort",
  "IjaHoldCollarUp", "LuoKneelReach", "RunnerLeanPostCall", "InterpreterHurryReach", "YaowaSitLoad", "IjaChoppedFallBack",
  "IjaParriedChoppedFall"]);
// One-frame snaps that predate the check, by clip, bone (lower-case name without separators, matched as a suffix)
// and clip time: only that frame of those bones is let off.
const SPIKE_EXEMPT = [
  // 2026-09-23 bake (the 0923 part of IjaParriedChoppedFall, after the cut): the right forearm turns 60 deg world
  // (83 deg local) in one frame at 0.83 s, the same frame and size at b33e30951 before this round re-authored 0-0.45 s;
  // the hand and fingers ride it.
  { clip: "IjaParriedChoppedFall", bones: ["rforearm", "rhand", "rfinger"], t: .833 },
];
// player-track part a contact names (the bake keeps one collar point for the front and the back of the collar)
const PLAYER_PART = { collar: "collar", collarFront: "collar", collarBack: "collar", head: "head", forearmR: "forearmR", shoulderR: "shoulderR",
  chest: "chest" };
// Skin regions of the wall contacts (the bake's WALL_REGIONS): bones whose weight the vertex carries.
const WALL_REGIONS = {
  shoulderBack: ["spine2", "lclavicle", "rclavicle"], back: ["spine1", "spine2"], shoulderL: ["lclavicle", "lupperarm"],
  shoulderR: ["rclavicle", "rupperarm"], head: ["head"], handL: ["lhand", "lfinger"], handR: ["rhand", "rfinger"],
  hips: ["pelvis", "spine"], feet: ["lfoot", "rfoot", "ltoe0", "rtoe0"], calves: ["lcalf", "rcalf"],
};

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const W = 520, H = 600;
const page = await browser.newPage({ viewport: { width: W * 2, height: H * 2 }, deviceScaleFactor: 1 });
const Shot = async (name) => { if (shots) await page.screenshot({ path: path.join(outDir, name + ".png"), clip: { x: 0, y: 0, width: W * 2, height: H * 2 } }); };
let failed = 0;
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&poseShot=1&phase=0&quality=high`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  const plan = await page.evaluate(async ({ W, H, WALL_REGIONS }) => {
    const WALL_REGIONS_PAGE = WALL_REGIONS;
    const T = window.Taierzhuang, THREE = await import("three");
    const api = await import("./Script_OpeningStoryboardAnimation.mjs");
    const library = await api.LoadOpeningStoryboardAnimation();
    T.actorFactory.SetBatcher?.(null);
    T.state.menu = false; T.state.running = false;
    for (const id of ["hud", "menu", "boot"]) document.getElementById(id)?.style.setProperty("display", "none", "important");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202226);
    scene.add(new THREE.HemisphereLight(0xdad6cc, 0x2a2a30, 2.4));
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2); key.position.set(-3, 6, 4); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const grid = new THREE.GridHelper(8, 32, 0x6a655c, 0x57524a); grid.position.y = .001; scene.add(grid);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 1, transparent: true, opacity: .55 });
    const walls = new THREE.Group(); scene.add(walls);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 30);
    const N = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const V = () => new THREE.Vector3();
    const state = window.openingClipsReview = { T, THREE, api, library, scene, camera, walls, wallMat, actors: [] };
    state.Make = (rig, role, clip) => {
      const kind = rig.startsWith("TengxianIja") ? "ija" : "nra", modelVariant = Number(rig.slice(-2)) - 1;
      const meta = api.OpeningClipMeta(clip) || {};
      const armed = (meta.props || []).includes("weapon");
      const weapon = !armed ? null : kind === "ija" ? "Type38" : (role === "luo" || role === "heyoutian") ? "Dadao" : "HanYang";
      const actor = T.actorFactory.Create(kind, { modelVariant, weapon, seed: 5100 + modelVariant, sizeScale: 1 });
      const soldier = { actor, id: role, alive: true, openingStoryboardPose: { clip, seconds: 0 } };
      api.InstallOpeningStoryboardAnimation(soldier);
      scene.add(actor.root); actor.root.visible = true;
      const bones = []; actor.characterRig.root.traverse(node => { if (node.isBone) bones.push(node); });
      const byName = new Map(bones.map(b => [N(b.name), b]));
      const skinned = []; actor.root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
      const skeleton = skinned[0]?.skeleton;
      // Bind-pose distance to the parent bone (skeleton space), for the length check.
      const bind = new Map();
      if (skeleton) skeleton.bones.forEach((b, i) => bind.set(b, new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert()));
      const pairs = [];
      for (const b of bones) {
        const parent = b.parent;
        if (!parent?.isBone || !bind.has(b) || !bind.has(parent)) continue;
        // TengxianHumanoidV1 (docs/Data_CharacterStandard.md): the pelvis hangs straight off GroundRoot and its
        // offset from it IS the root motion (the Lugou rigs bound it on GroundRoot's origin, which the 1 cm filter skipped), so it is not
        // a segment length; every other body segment still has to hold its bind length.
        if (/pelvis$/.test(N(b.name))) continue;
        const rest = V().setFromMatrixPosition(bind.get(b)).distanceTo(V().setFromMatrixPosition(bind.get(parent)));
        if (rest > .01) pairs.push({ bone: b, parent, rest });
      }
      const fingers = {};
      fingers.L = bones.filter(b => /lfinger[1-4]$/.test(N(b.name)) && !/nub/.test(N(b.name)));
      fingers.R = bones.filter(b => /rfinger[1-4]$/.test(N(b.name)) && !/nub/.test(N(b.name)));
      const toes = { L: bones.find(b => /ltoe0$/.test(N(b.name))), R: bones.find(b => /rtoe0$/.test(N(b.name))) };
      // Bind-pose reach of each arm: shoulder -> elbow -> wrist -> grip point (finger-root centroid).
      const reach = {};
      for (const side of ["L", "R"]) {
        const s = side.toLowerCase(), at = b => b && bind.has(b) ? V().setFromMatrixPosition(bind.get(b)) : null;
        const upper = at(bones.find(b => N(b.name).endsWith(s + "upperarm"))), fore = at(bones.find(b => N(b.name).endsWith(s + "forearm")));
        const hand = at(bones.find(b => N(b.name).endsWith(s + "hand"))), roots = fingers[side].map(at).filter(Boolean);
        if (!upper || !fore || !hand || !roots.length) continue;
        const grip = roots.reduce((sum, p) => sum.add(p), V()).divideScalar(roots.length);
        reach[side] = upper.distanceTo(fore) + fore.distanceTo(hand) + hand.distanceTo(grip);
      }
      const row = library.config.models.find(r => r.id === rig);
      const contactPoints = row?.contactPoints || {};
      const entry = { rig, role, clip, actor, soldier, bones, byName, pairs, fingers, toes, contactPoints, clock: 0, reach,
        skinned, regionVerts: new Map(), knees: { L: bones.find(b => /lcalf$/.test(N(b.name))), R: bones.find(b => /rcalf$/.test(N(b.name))) } };
      state.actors.push(entry);
      return entry;
    };
    state.Clear = () => {
      for (const e of state.actors) { scene.remove(e.actor.root); e.actor.Dispose?.(); }
      state.actors = []; walls.clear();
    };
    state.Grip = (e, side) => {
      const out = V(); for (const b of e.fingers[side]) out.add(b.getWorldPosition(V()));
      return out.divideScalar(Math.max(1, e.fingers[side].length));
    };
    // Skin patch in world space, pushed `standoff` metres out along its normal (the authored
    // knuckle standoff: a fist in the hair or on a collar cannot sit inside the skin).
    state.Contact = (e, part, standoff = 0) => {
      const row = e.contactPoints[part]; if (!row) return null;
      const bone = e.byName.get(N(row.bone)); if (!bone) return null;
      const point = bone.localToWorld(V().fromArray(row.offset));
      const normal = V().fromArray(row.normal).transformDirection(bone.matrixWorld);
      return point.addScaledVector(normal, standoff);
    };
    // Closest distance from a point to the visible (non-skinned) triangles of a prop or weapon.
    state.MeshDistance = (object, point) => {
      let best = Infinity; const tri = new THREE.Triangle(), q = V();
      object?.updateWorldMatrix(true, true);
      object?.traverse(o => {
        if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
        const a = o.geometry.getAttribute("position"), index = o.geometry.getIndex();
        const count = index ? index.count : a.count;
        const P = i => V().fromBufferAttribute(a, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld);
        for (let i = 0; i + 2 < count; i += 3) {
          tri.set(P(i), P(i + 1), P(i + 2)); tri.closestPointToPoint(point, q);
          best = Math.min(best, q.distanceTo(point));
        }
      });
      return best;
    };
    // The butt of a rifle: triangles within 0.15 m of the butt plate in the rifle's canonical frame (Script_Actor
    // BuildWeaponGeometry: the right-hand grip at the origin, barrel along -z, butt plate at z +0.255), closest to
    // a point. zMax (the butt plate's far face) checks the group is in that frame.
    state.ButtDistance = (group, point) => {
      let best = Infinity, zMax = -Infinity; const tri = new THREE.Triangle(), q = V();
      if (!group) return { best, zMax };
      group.updateWorldMatrix(true, true);
      const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
      group.traverse(o => {
        if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
        const toGroup = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
        const a = o.geometry.getAttribute("position"), index = o.geometry.getIndex();
        const count = index ? index.count : a.count;
        const L = i => V().fromBufferAttribute(a, index ? index.getX(i) : i).applyMatrix4(toGroup);
        for (let i = 0; i + 2 < count; i += 3) {
          const p0 = L(i), p1 = L(i + 1), p2 = L(i + 2);
          zMax = Math.max(zMax, p0.z, p1.z, p2.z);
          if ((p0.z + p1.z + p2.z) / 3 < .105) continue;
          tri.set(p0.applyMatrix4(group.matrixWorld), p1.applyMatrix4(group.matrixWorld), p2.applyMatrix4(group.matrixWorld));
          tri.closestPointToPoint(point, q); best = Math.min(best, q.distanceTo(point));
        }
      });
      return { best, zMax };
    };
    // Blade against the partner's rifle (a parry): closest rifle vertex to the blade triangles.
    state.MeshGap = (blade, other) => {
      let best = Infinity; const p = V();
      other?.updateWorldMatrix(true, true);
      other?.traverse(o => {
        if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
        const a = o.geometry.getAttribute("position"), step = Math.max(1, Math.floor(a.count / 400));
        for (let i = 0; i < a.count; i += step) best = Math.min(best, state.MeshDistance(blade, p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).clone()));
      });
      return best;
    };
    // Rough body capsules (runtime metres) for the between-actor overlap measure. Hands are left
    // out: they are meant to touch.
    const CAPSULES = [["pelvis", "neck", .13, "torso"], ["head", "headTop", .10, "head"],
      ["lthigh", "lcalf", .075, "thighL"], ["rthigh", "rcalf", .075, "thighR"], ["lcalf", "lfoot", .055, "calfL"], ["rcalf", "rfoot", .055, "calfR"],
      ["lfoot", "ltoe0", .045, "footL"], ["rfoot", "rtoe0", .045, "footR"], ["lupperarm", "lforearm", .05, "upperArmL"], ["rupperarm", "rforearm", .05, "upperArmR"],
      ["lforearm", "lhand", .04, "forearmL"], ["rforearm", "rhand", .04, "forearmR"]];
    state.Capsules = (e) => {
      const at = key => {
        if (key === "headTop") {
          const head = at("head"), neck = at("neck");
          return head.clone().add(head.clone().sub(neck).setLength(.13));
        }
        const bone = e.bones.find(b => N(b.name).endsWith(key) && !/nub/.test(N(b.name)) && (key !== "neck" || !/neck\d/.test(N(b.name))));
        return bone ? bone.getWorldPosition(V()) : null;
      };
      return CAPSULES.map(([a, b, r, name]) => ({ a: at(a), b: at(b), r, name })).filter(c => c.a && c.b);
    };
    const SegmentDistance = (p1, q1, p2, q2) => {
      const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
      const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
      let s = 0, t = 0;
      if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
      if (a <= 1e-9) t = Math.min(1, Math.max(0, f / e));
      else {
        const c = d1.dot(r);
        if (e <= 1e-9) s = Math.min(1, Math.max(0, -c / a));
        else {
          const b = d1.dot(d2), den = a * e - b * b;
          s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
          t = (b * s + f) / e;
          if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
        }
      }
      return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
    };
    // Deepest capsule overlap between two actors: { depth, pair }.
    const CORE = new Set(["torso", "head"]);
    state.Overlap = (one, two, skipOne = [], skipTwo = []) => {
      let best = { depth: -Infinity, pair: null, core: -Infinity, corePair: null };
      const A = state.Capsules(one).filter(c => !skipOne.includes(c.name)), B = state.Capsules(two).filter(c => !skipTwo.includes(c.name));
      for (const a of A) for (const b of B) {
        const depth = a.r + b.r - SegmentDistance(a.a, a.b, b.a, b.b);
        if (depth > best.depth) { best.depth = depth; best.pair = `${a.name}/${b.name}`; }
        if (CORE.has(a.name) && CORE.has(b.name) && depth > best.core) { best.core = depth; best.corePair = `${a.name}/${b.name}`; }
      }
      return best;
    };
    // Pose every actor at stage time `at` (clip seconds = at - offsetS, clamped at 0), after a
    // warm-up that takes each actor through its pose blend so the sample is the clip itself.
    state.Pose = (at, warm = false) => {
      for (const e of state.actors) {
        const seconds = Math.max(0, at - (e.offsetS || 0));
        // holdUntil (a single-clip review sets it to the hold loop's end): play through the
        // loop instead of wrapping inside it, so the part after the hold is sampled too.
        // upperBody:false: the review measures the whole baked clip (an upper-body clip such as
        // InterpreterHurryReach otherwise rides this page's standing native legs).
        e.soldier.openingStoryboardPose = { clip: e.clip, seconds, holdUntil: e.holdUntil, upperBody: false };
        const steps = warm ? 30 : 1;
        for (let i = 0; i < steps; i++) { e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 }); }
      }
      scene.updateMatrixWorld(true);
    };
    // Four views: left side, right side, front, and a 45-degree top view from the front-left
    // (the top view comes from the right when a wall stands on the left).
    state.Render = (target, span, env) => {
      const r = T.renderer, size = new THREE.Vector2(); r.getSize(size);
      r.setScissorTest(true);
      const flip = env?.wallLeftM ? -1 : 1;
      const views = [[new THREE.Vector3(-3.4, 1.1, 0), 0], [new THREE.Vector3(3.4, 1.1, 0), 1],
        [new THREE.Vector3(0, 1.1, -3.4), 2], [new THREE.Vector3(-2.3 * flip, 2.1, -2.6), 3]];
      for (const [offset, slot] of views) {
        camera.left = -span * W / H / 2; camera.right = span * W / H / 2; camera.top = span * .62; camera.bottom = -span * .38;
        camera.updateProjectionMatrix();
        camera.position.copy(target).add(offset); camera.lookAt(target.x, target.y + .0, target.z); camera.updateMatrixWorld(true);
        const x = (slot % 2) * W, y = size.y - H * (1 + (slot >> 1));
        r.setViewport(x, y, W, H); r.setScissor(x, y, W, H);
        r.render(scene, camera);
      }
      r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
    };
    state.Walls = (env, yaw = 0, at = V()) => {
      walls.clear();
      const add = (x, z, sx, sz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.4, sz), wallMat);
        m.position.set(x, .7, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(at); m.rotation.y = yaw; walls.add(m);
      };
      if (env?.wallBehindM) add(0, env.wallBehindM + .03, 2.0, .06);
      if (env?.wallLeftM) add(-(env.wallLeftM + .03), 0, .06, 2.0);
      if (env?.wallRightM) add(env.wallRightM + .03, 0, .06, 2.0);
    };
    // Signed skin-to-wall gap of one region (runtime metres, negative = inside), from the CPU-skinned
    // vertices whose weight on the region's bones is over one half. Walls: env of the clip, in the
    // actor frame (+x right, -z forward): wallBehindM at +z, wallLeftM at -x, wallRightM at +x.
    state.RegionGap = (e, region, env) => {
      const want = WALL_REGIONS_PAGE[region] || [];
      let best = Infinity; const v = V();
      e.actor.root.updateMatrixWorld(true);
      for (const mesh of e.skinned) {
        let picked = e.regionVerts.get(mesh)?.get(region);
        if (!picked) {
          picked = [];
          const idx = mesh.geometry.getAttribute("skinIndex"), wgt = mesh.geometry.getAttribute("skinWeight"), bones = mesh.skeleton.bones;
          for (let i = 0; i < idx.count; i++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { const b = bones[idx.getComponent(i, k)]; if (b && want.some(w => N(b.name).endsWith(w) || (w.endsWith("finger") && N(b.name).includes(w)))) sum += wgt.getComponent(i, k); }
            if (sum > .5) picked.push(i);
          }
          if (!e.regionVerts.has(mesh)) e.regionVerts.set(mesh, new Map());
          e.regionVerts.get(mesh).set(region, picked);
        }
        mesh.skeleton.update();
        const inverse = new THREE.Matrix4().copy(e.actor.root.matrixWorld).invert();
        for (const i of picked) {
          mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          if (env?.wallBehindM) best = Math.min(best, env.wallBehindM - v.z);
          if (env?.wallLeftM) best = Math.min(best, v.x + env.wallLeftM);
          if (env?.wallRightM) best = Math.min(best, env.wallRightM - v.x);
        }
      }
      return best;
    };
    const clips = Object.entries(library.config.clips).filter(([, m]) => !m.legacy && m.rig).map(([name, m]) => ({ name, rig: m.rig, role: m.role, duration: m.duration,
      contacts: m.contacts || [], env: m.env || null, stage: m.stage || null, player: m.player === true }));
    return { clips, stages: library.config.stages, fps: library.config.fps };
  }, { W, H, WALL_REGIONS });

  // ---- 1/3/4: every authored clip alone on its canonical rig --------------------------------
  const clipRows = [];
  for (const clip of plan.clips) {
    if (only.length && !only.includes(clip.name)) continue;
    const row = await page.evaluate(({ clip, fps, spikes, LIMIT, exempt }) => {
      const s = window.openingClipsReview, { THREE } = s;
      s.Clear();
      const e = s.Make(clip.rig, clip.role, clip.name);
      e.holdUntil = s.library.config.clips[clip.name]?.holdLoop?.[1];
      const turns = [], lastQ = new Map();
      const report = (s.library.config.models.find(r => r.id === clip.rig)?.clips || []).find(c => c.clip === clip.name) || {};
      const plants = report.plants || [], kneePlants = report.kneePlants || [];
      const wallRows = (clip.contacts || []).filter(c => c.target === "wall" && c.action !== "release").map(c => ({ limb: c.limb, t0: c.t, t1: c.untilT ?? c.t, max: -Infinity, min: Infinity }));
      const frames = Math.round(clip.duration * fps) + 1;
      const feet = [], ratios = [], knees = [];
      let finite = true;
      s.Pose(0, true);
      for (let f = 0; f < frames; f++) {
        const t = Math.min(clip.duration, f / fps);
        s.Pose(t);
        const b = e.actor.characterRig.bones;
        feet.push({ t, L: [b.footL.getWorldPosition(new THREE.Vector3()), e.toes.L?.getWorldPosition(new THREE.Vector3())],
          R: [b.footR.getWorldPosition(new THREE.Vector3()), e.toes.R?.getWorldPosition(new THREE.Vector3())] });
        knees.push({ t, L: e.knees.L?.getWorldPosition(new THREE.Vector3()), R: e.knees.R?.getWorldPosition(new THREE.Vector3()) });
        // Every second frame inside the window, and the frames nearest its ends (a single-instant
        // contact such as a palm slapped on the wall is the frame nearest that instant).
        for (const w of wallRows) if (t >= w.t0 - .5 / fps && t <= w.t1 + .5 / fps && (f % 2 === 0 || Math.abs(t - w.t0) <= .5 / fps || Math.abs(t - w.t1) <= .5 / fps)) {
          const gap = s.RegionGap(e, w.limb, clip.env);
          w.max = Math.max(w.max, gap); w.min = Math.min(w.min, gap); w.samples = (w.samples || 0) + 1;
        }
        if (spikes) {
          const step = [];
          for (const b of e.bones) {
            const q = b.getWorldQuaternion(new THREE.Quaternion()), prev = lastQ.get(b);
            step.push(prev ? prev.angleTo(q) * 180 / Math.PI : 0); lastQ.set(b, q);
          }
          turns.push(step);
        }
        const frameRatios = e.pairs.map(p => p.bone.getWorldPosition(new THREE.Vector3()).distanceTo(p.parent.getWorldPosition(new THREE.Vector3())) / p.rest);
        ratios.push(frameRatios);
        e.actor.root.traverse(o => { if (!o.matrixWorld.elements.every(Number.isFinite)) finite = false; });
      }
      let footM = 0, footAt = null;
      for (const [side, t0, t1] of plants) {
        const win = feet.filter(r => r.t >= t0 - 1e-6 && r.t <= t1 + 1e-6);
        for (let k = 0; k < 2; k++) {
          const a = win[0]?.[side][k]; if (!a) continue;
          for (const r of win) { const d = r[side][k].distanceTo(a); if (d > footM) { footM = d; footAt = `${side}${k ? "toe" : "ankle"}@${r.t.toFixed(2)}`; } }
        }
      }
      let kneeM = 0, kneeAt = null;
      for (const [side, t0, t1] of kneePlants) {
        const win = knees.filter(r => r.t >= t0 - 1e-6 && r.t <= t1 + 1e-6 && r[side]);
        for (const r of win) { const d = r[side].distanceTo(win[0][side]); if (d > kneeM) { kneeM = d; kneeAt = `${side}@${r.t.toFixed(2)}`; } }
      }
      const all = ratios.flat().sort((a, b) => a - b), median = all[all.length >> 1] || 1;
      let boneDev = 0, boneAt = null;
      ratios.forEach((row, f) => row.forEach((r, i) => { const d = Math.abs(r / median - 1); if (d > boneDev) { boneDev = d; boneAt = `${e.pairs[i].bone.name}@${(f / fps).toFixed(2)}`; } }));
      // 10) turns[f][i]: bone i's world rotation from frame f-1 to f (frame 0 has none)
      let jumps = 0, jumpAt = null, worstTurn = 0, worstTurnAt = null, exempted = 0;
      const Exempt = (bone, f) => exempt.some(x => Math.abs(f / fps - x.t) <= .5 / fps && x.bones.some(b => {
        const n = bone.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        return n.endsWith(b) || (b.endsWith("finger") && n.includes(b));
      }));
      for (let f = 1; f < turns.length; f++) turns[f].forEach((d, i) => {
        if (d > worstTurn) { worstTurn = d; worstTurnAt = `${e.bones[i].name}@${(f / fps).toFixed(2)}`; }
        const before = f > 1 ? turns[f - 1][i] : 0, after = f + 1 < turns.length ? turns[f + 1][i] : 0;
        if (d > LIMIT.jumpDeg && d > LIMIT.jumpRatio * before && d > LIMIT.jumpRatio * after) {
          if (Exempt(e.bones[i], f)) { exempted++; return; }
          jumps++; jumpAt ||= `${e.bones[i].name}@${(f / fps).toFixed(2)} ${d.toFixed(0)}°`;
        }
      });
      return { clip: clip.name, rig: clip.rig, frames, plants: plants.length, footM, footAt, kneePlants: kneePlants.length, kneeM, kneeAt,
        walls: wallRows.map(w => ({ limb: w.limb, t0: w.t0, t1: w.t1, max: w.max, min: w.min, samples: w.samples || 0 })), boneDev, boneAt, finite,
        spikes, jumps, jumpAt, worstTurn, worstTurnAt, exempted };
    }, { clip, fps: plan.fps, spikes: ROUND_0925.has(clip.name), LIMIT, exempt: SPIKE_EXEMPT.filter(x => x.clip === clip.name) });
    clipRows.push(row);
    const wallBad = row.walls.some(w => !w.samples || !(w.max <= LIMIT.wallM) || !(w.min >= -LIMIT.wallM));
    const bad = row.footM > LIMIT.footM || row.kneeM > LIMIT.kneeM || wallBad || row.boneDev > LIMIT.boneRatio || !row.finite || row.jumps > 0;
    if (bad) failed++;
    console.log(`${bad ? "FAIL" : "ok  "} ${row.clip.padEnd(24)} ${row.rig} foot ${(row.footM * 100).toFixed(2)} cm (${row.plants} plants, ${row.footAt || "-"})`
      + (row.kneePlants ? ` knee ${(row.kneeM * 100).toFixed(2)} cm (${row.kneeAt || "-"})` : "")
      + row.walls.map(w => ` wall ${w.limb} ${w.t0}-${w.t1}s ${(w.min * 100).toFixed(1)}..${(w.max * 100).toFixed(1)} cm`).join("")
      + ` bone ${(row.boneDev * 100).toFixed(2)}% (${row.boneAt || "-"}) finite ${row.finite}`
      + (row.spikes ? ` spikes ${row.jumps}${row.jumpAt ? ` (${row.jumpAt})` : ""}${row.exempted ? ` (+${row.exempted} exempted, SPIKE_EXEMPT)` : ""} largest step ${row.worstTurn.toFixed(0)}° (${row.worstTurnAt || "-"})` : ""));
    if (shots) {
      const d = clip.duration, times = [0, d * .5, d];
      for (const c of clip.contacts) if (c.t > .05 && c.t < d - .05) { times[1] = c.t; break; }
      for (const [i, t] of times.entries()) {
        await page.evaluate(({ t, env }) => {
          const s = window.openingClipsReview; s.Walls(env); s.Pose(t);
          const pelvis = s.actors[0].actor.characterRig.bones.pelvis.getWorldPosition(new s.THREE.Vector3());
          s.Render(new s.THREE.Vector3(pelvis.x, .75, pelvis.z), 2.6, env);
        }, { t, env: clip.env });
        await Shot(`Clip_${clip.name}_${i}_${t.toFixed(2)}`);
      }
    }
  }

  // ---- 9: hands and the butt on the first-person player (clip player track) ----------------
  const playerRows = [];
  for (const clip of plan.clips) {
    const world = clip.contacts.some(c => Array.isArray(c.pointM));
    if ((!clip.player && !world) || (only.length && !only.includes(clip.name))) continue;
    const checks = [];
    for (const c of clip.contacts) {
      if (/^hand[LR]$/.test(c.limb) && Array.isArray(c.pointM)) {
        // a hand on a point of the world (the runner's fist on the post), actor frame, runtime metres
        const from = Math.ceil(c.t * plan.fps - 1e-6) / plan.fps, until = c.untilT ?? clip.duration;
        for (let t = from; t <= Math.max(from, until) + 1e-6; t += 2 / plan.fps)
          checks.push({ limb: c.limb, action: c.action, part: c.target || "world", point: c.pointM, contactT: c.t, at: Math.round(t * 1000) / 1000 });
        continue;
      }
      const part = PLAYER_PART[c.part];
      if (!part || c.action === "release") continue;
      if (/^hand[LR]$/.test(c.limb) && (c.action === "grab" || c.action === "hold" || (c.action === "reach" && c.gapM != null))) {
        // held from the first baked frame at/after the contact to the same hand's next release or the clip end
        const from = Math.ceil(c.t * plan.fps - 1e-6) / plan.fps;
        const release = clip.contacts.find(o => (o.limb === c.limb || o.limb === "handsLR") && o.t > c.t && o.action === "release");
        const until = release ? release.t : clip.duration;
        for (let t = from; t <= Math.max(from, until) + 1e-6; t += 2 / plan.fps)
          checks.push({ limb: c.limb, action: c.action, part: c.part, track: part, contactT: c.t, at: Math.round(t * 1000) / 1000,
            gap: c.action === "reach" ? c.gapM : 0 });
      } else if (c.limb === "butt" && c.action === "strike" && c.playerOffsetM)   // where on the head (2026-09-25 clips declare it)
        checks.push({ limb: c.limb, action: c.action, part: c.part, track: part, contactT: c.t, at: c.t, offset: c.playerOffsetM || [0, 0, 0] });
    }
    if (!checks.length) continue;
    const rows = await page.evaluate(({ clip, checks }) => {
      const s = window.openingClipsReview, { THREE } = s;
      s.Clear();
      const e = s.Make(clip.rig, clip.role, clip.name), out = [];
      e.holdUntil = s.library.config.clips[clip.name]?.holdLoop?.[1];
      s.Pose(0, true);
      for (const c of checks) {
        s.Pose(c.at, true);
        const p = c.point ? { x: c.point[0], y: c.point[1], z: c.point[2] } : s.api.OpeningPlayerPoint(clip.rig, clip.name, c.track, c.at);
        if (!p) { out.push({ ...c, missing: true }); continue; }
        const o = c.offset || [0, 0, 0], target = e.actor.root.localToWorld(new THREE.Vector3(p.x + o[0], p.y + o[1], p.z + o[2]));
        if (c.limb === "butt") {
          const butt = s.ButtDistance(e.actor.weaponGroup, target);
          // the rifle's canonical frame must be the one the butt segment is cut from (butt plate at z 0.255-0.27)
          out.push({ ...c, error: butt.zMax > .24 && butt.zMax < .30 ? butt.best : Infinity, buttZMax: butt.zMax, wholeRifle: s.MeshDistance(e.actor.weaponGroup, target) });
          continue;
        }
        const side = c.limb.slice(-1), shoulder = e.bones.find(b => b.name.toLowerCase().replace(/[^a-z0-9]/g, "").endsWith(side.toLowerCase() + "upperarm"));
        // a reach (gap > 0) is measured as how far the hand is from stopping gap metres short of the point
        // the arm's reach: to the grip itself when the hand stops short of the point (a reach)
        const grip = s.Grip(e, side), aim = c.gap ? grip : target;
        out.push({ ...c, error: Math.abs(grip.distanceTo(target) - (c.gap || 0)), ratio: shoulder && e.reach[side] ? shoulder.getWorldPosition(new THREE.Vector3()).distanceTo(aim) / e.reach[side] : NaN });
      }
      return out;
    }, { clip, checks });
    const groups = new Map();
    for (const row of rows) {
      const k = `${row.limb}.${row.action}.${row.part}@${row.contactT}`;
      const g = groups.get(k) || { ...row, error: -Infinity, ratio: -Infinity, samples: 0 };
      if (row.missing) g.missing = true;
      if (row.error > g.error) { g.error = row.error; g.worstAt = row.at; }
      if (row.ratio > g.ratio) { g.ratio = row.ratio; g.ratioAt = row.at; }
      g.samples++; groups.set(k, g);
    }
    for (const row of groups.values()) {
      playerRows.push({ clip: clip.name, ...row });
      const hand = row.limb !== "butt";
      const bad = row.missing || !(row.error <= (row.gap ? LIMIT.reachGapM : LIMIT.contactM)) || (hand && !(row.ratio <= LIMIT.reachRatio));
      if (bad) failed++;
      console.log(`${bad ? "FAIL" : "ok  "} ${row.point ? "world" : "player"} ${clip.name}.${row.limb} ${row.action} -> ${row.point ? "" : "player."}${row.part} @${row.contactT.toFixed(2)}s`
        + (row.gap ? ` (held ${row.gap} m short)` : "")
        + (row.buttZMax != null ? ` (butt segment; whole rifle ${(row.wholeRifle * 100).toFixed(1)} cm, butt plate z ${row.buttZMax.toFixed(3)})` : "")
        + (row.missing ? " player track missing" : ` max ${(row.error * 100).toFixed(1)} cm over ${row.samples} samples (worst @${row.worstAt.toFixed(2)}s)`
        + (hand ? `, reach ${row.ratio.toFixed(3)} of the arm (@${row.ratioAt.toFixed(2)}s)` : "")));
    }
    if (shots) {
      const times = [...new Set(checks.map(c => c.contactT))];
      for (const t of times) {
        await page.evaluate(({ clip, t }) => {
          const s = window.openingClipsReview; s.Walls(null); s.Pose(t, true);
          const pelvis = s.actors[0].actor.characterRig.bones.pelvis.getWorldPosition(new s.THREE.Vector3());
          s.Render(new s.THREE.Vector3(pelvis.x, .75, pelvis.z), 2.6, null);
        }, { clip, t });
        await Shot(`Player_${clip.name}_${t.toFixed(2)}`);
      }
    }
  }

  // ---- 2: paired stages, both actors placed from the manifest ------------------------------
  const contactRows = [], overlapRows = [];
  // IjaChoppedFallBack plays on the chopRear stage in place of IjaChoppedFallWall (same cut, same root): Luo's
  // blade and the two bodies are checked with it too.
  const stageRuns = Object.entries(plan.stages);
  const chopRear = plan.stages.chopRear;
  if (chopRear?.actors?.ijaB && plan.clips.some(c => c.name === "IjaChoppedFallBack"))
    stageRuns.push(["chopRear+FallBack", { ...chopRear, actors: { ...chopRear.actors, ijaB: { ...chopRear.actors.ijaB, clip: "IjaChoppedFallBack" } } }]);
  for (const [name, stage] of stageRuns) {
    const actors = Object.entries(stage.actors).filter(([, a]) => a.rig && a.clip);
    if (only.length && !actors.some(([, a]) => only.includes(a.clip))) continue;
    const checks = [];
    for (const [role, a] of actors) {
      const meta = plan.clips.find(c => c.name === a.clip);
      for (const c of meta?.contacts || []) {
        const partner = stage.actors[c.partnerRole];
        if (!c.partnerRole || !partner?.rig || !c.part) continue;
        if (!/^hand[LR]$|^bayonet$|^blade$/.test(c.limb)) continue;
        const at = c.t + (a.offsetS || 0);
        // Only while the partner's clip is running in this stage (a clip shared by two stages
        // carries the contacts of both; the other stage's partner has not started yet).
        if (at < (partner.offsetS || 0) - 1e-6) continue;
        // A grab/hold is kept until the same hand's next release, the end of this clip or
        // the end of the partner's clip, sampled on every second baked frame (1/12 s). Between
        // two baked frames both bodies are interpolated independently; in the fastest beat (the
        // jerk-up of CaptiveDraggedFromDirt at 2.0 s) that adds up to ~1.7 cm on top.
        // Holds start on the first baked frame at/after the contact time (a fist that closes
        // between two frames is still travelling on the earlier one).
        let from = at, until = at;
        if (c.action === "grab" || c.action === "hold") {
          from = Math.ceil(at * plan.fps - 1e-6) / plan.fps;
          const release = (meta.contacts || []).find(o => (o.limb === c.limb || o.limb === "handsLR") && o.t > c.t && o.action === "release");
          const partnerEnd = (plan.clips.find(p => p.name === partner.clip)?.duration || 0) + (partner.offsetS || 0);
          until = Math.min(release ? release.t + (a.offsetS || 0) : meta.duration + (a.offsetS || 0), partnerEnd);
        }
        for (let t = from; t <= Math.max(from, until) + 1e-6; t += 2 / plan.fps)
          checks.push({ role, clip: a.clip, limb: c.limb, action: c.action, partner: c.partnerRole, part: c.part, standoff: c.standoffM || 0,
            contactT: at, at: Math.round(t * 1000) / 1000 });
      }
    }
    const times = [...new Set([0, ...checks.map(c => c.at)])].sort((a, b) => a - b);
    const rows = await page.evaluate(({ stage, actors, checks, times }) => {
      const s = window.openingClipsReview, { THREE } = s;
      s.Clear();
      const byRole = {};
      for (const [role, a] of actors) {
        const e = s.Make(a.rig, role, a.clip);
        e.offsetS = a.offsetS || 0;
        e.actor.root.position.set(a.x, 0, a.z); e.actor.root.rotation.set(0, a.yawDeg * Math.PI / 180, 0);
        byRole[role] = e;
      }
      const out = [];
      s.Pose(0, true);
      for (const at of times) {
        s.Pose(at, true);
        for (const c of checks.filter(c => Math.abs(c.at - at) < 1e-6)) {
          const me = byRole[c.role], other = byRole[c.partner];
          if (c.part === "muzzle") { out.push({ ...c, error: s.MeshGap(me.actor.weaponGroup, other.actor.weaponGroup) }); continue; }
          const target = s.Contact(other, c.part, c.standoff);
          if (!target) { out.push({ ...c, missing: true }); continue; }
          let error;
          if (c.limb === "bayonet") error = s.MeshDistance(me.actor.characterRig.openingProps?.items.get("bayonet")?.object, target);
          else if (c.limb === "blade") error = s.MeshDistance(me.actor.weaponGroup, target);
          else error = s.Grip(me, c.limb.slice(-1)).distanceTo(target);
          out.push({ ...c, error });
        }
      }
      return out;
    }, { stage, actors, checks, times });
    // Between-actor body overlap (capsules, hands excluded) while every clip of the stage is
    // running, 12 samples/s. An arm that has a declared contact on the other actor in this stage
    // (a fist in the hair, a hand on the collar) may lie on that body: its forearm is left out.
    const end = Math.max(...actors.map(([, a]) => (plan.clips.find(c => c.name === a.clip)?.duration || 0) + (a.offsetS || 0)));
    const start = Math.max(...actors.map(([, a]) => a.offsetS || 0));
    const reach = {};
    for (const [role, a] of actors) for (const c of plan.clips.find(p => p.name === a.clip)?.contacts || [])
      if (c.partnerRole && /^hand[LR]$/.test(c.limb)) (reach[`${role}>${c.partnerRole}`] ||= []).push("forearm" + c.limb.slice(-1));
    const overlaps = await page.evaluate(({ start, end, reach }) => {
      const s = window.openingClipsReview, worst = {};
      for (let t = start; t <= end + 1e-6; t += 1 / 12) {
        s.Pose(t, true);
        for (let i = 0; i < s.actors.length; i++) for (let j = i + 1; j < s.actors.length; j++) {
          const one = s.actors[i], two = s.actors[j], key = `${one.role}/${two.role}`;
          const o = s.Overlap(one, two, reach[`${one.role}>${two.role}`] || [], reach[`${two.role}>${one.role}`] || []);
          const w = worst[key] ||= { depth: -Infinity, core: -Infinity };
          if (o.depth > w.depth) Object.assign(w, { depth: o.depth, pair: o.pair, at: t });
          if (o.core > w.core) Object.assign(w, { core: o.core, corePair: o.corePair, coreAt: t });
        }
      }
      return worst;
    }, { start, end, reach });
    for (const [pair, o] of Object.entries(overlaps)) {
      overlapRows.push({ stage: name, pair, ...o });
      const bad = o.depth > LIMIT.limbOverlapM || o.core > LIMIT.coreOverlapM;
      if (bad) failed++;
      console.log(`${bad ? "FAIL" : "ok  "} stage ${name.padEnd(12)} overlap ${pair}: deepest ${(Math.max(0, o.depth) * 100).toFixed(1)} cm (${o.pair} @${o.at.toFixed(2)}s),`
        + ` torso/head ${(Math.max(0, o.core) * 100).toFixed(1)} cm${o.corePair ? ` (${o.corePair} @${o.coreAt.toFixed(2)}s)` : ""}`);
    }
    const groups = new Map();
    for (const row of rows) {
      const k = `${row.clip}.${row.limb}.${row.action}.${row.part}@${row.contactT}`;
      const g = groups.get(k);
      if (!g || row.missing || row.error > g.error) groups.set(k, { ...row, samples: (g?.samples || 0) + 1, worstAt: row.at });
      else g.samples++;
    }
    for (const row of groups.values()) {
      contactRows.push({ stage: name, ...row });
      const bad = row.missing || !(row.error <= LIMIT.contactM);
      if (bad) failed++;
      console.log(`${bad ? "FAIL" : "ok  "} stage ${name.padEnd(12)} ${row.clip}.${row.limb} ${row.action} -> ${row.partner}.${row.part} @${row.contactT.toFixed(2)}s`
        + ` ${row.missing ? "contact point missing" : `max ${(row.error * 100).toFixed(1)} cm over ${row.samples} samples (worst @${row.worstAt.toFixed(2)}s)`}`);
    }
    if (shots) {
      const keys = [...new Set([0, ...checks.map(c => c.contactT), end * .6, end].map(t => Math.round(t * 100) / 100))].sort((a, b) => a - b);
      for (const t of keys) {
        await page.evaluate(({ t, env }) => {
          const s = window.openingClipsReview; s.Walls(env); s.Pose(t, true);
          const c = new s.THREE.Vector3(); for (const e of s.actors) c.add(e.actor.characterRig.bones.pelvis.getWorldPosition(new s.THREE.Vector3()));
          c.divideScalar(s.actors.length); s.Render(new s.THREE.Vector3(c.x, .75, c.z), 2.4, env);
        }, { t, env: plan.clips.find(c => c.name === stage.actors[stage.anchor]?.clip)?.env || null });
        await Shot(`Stage_${name}_${t.toFixed(2)}`);
      }
    }
  }
  // ---- 8: runtime behaviour of the prop and weapon layer across clip changes -----------------
  const runtimeRows = only.length ? [] : await page.evaluate(() => {
    const s = window.openingClipsReview, { THREE } = s, out = [];
    const W = o => o.getWorldPosition(new THREE.Vector3());
    // Step one actor through a clip change at 60 steps/s: the soldier's pose switches from
    // (a, ta) to (b, 0) and b runs for `span` seconds.
    const Switch = (e, a, ta, b, span, Measure) => {
      e.soldier.openingStoryboardPose = { clip: a, seconds: ta };
      for (let i = 0; i < 40; i++) { e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 }); }
      s.scene.updateMatrixWorld(true);
      let last = Measure(), worst = 0, first = null;
      for (let i = 1; i <= Math.round(Math.min(span, .28) * 60); i++) {
        e.soldier.openingStoryboardPose = { clip: b, seconds: i / 60 };
        e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 });
        s.scene.updateMatrixWorld(true);
        const now = Measure();
        const step = now && last ? now.distanceTo(last) : 0;
        if (first === null) first = step;
        worst = Math.max(worst, step); last = now;
      }
      return { worst, first };
    };
    // a) the rifle of IjaButtStrike -> IjaHoldCollarUp (0.7 m apart between the two tracks)
    s.Clear();
    let e = s.Make("TengxianIja02", "ijaA", "IjaButtStrike");
    let r = Switch(e, "IjaButtStrike", 1.0, "IjaHoldCollarUp", .4, () => W(e.actor.weaponGroup));
    out.push({ name: "weapon blend IjaButtStrike->IjaHoldCollarUp", stepM: r.worst, firstM: r.first });
    // b) the bayonet going back into the scabbard mount: IjaWipeSheathBayonet end -> IjaReadyRifle
    s.Clear();
    e = s.Make("TengxianIja02", "ijaA", "IjaWipeSheathBayonet");
    const knife = () => e.actor.characterRig.openingProps?.items.get("bayonet")?.object;
    const wipeEnd = s.library.config.clips.IjaWipeSheathBayonet.duration;
    r = Switch(e, "IjaWipeSheathBayonet", wipeEnd, "IjaReadyRifle", .6, () => knife() ? W(knife()) : null);
    const sheathed = knife()?.visible === true;
    const hip = knife() ? W(knife()).distanceTo(W(e.actor.characterRig.bones.pelvis)) : Infinity;
    out.push({ name: "bayonet stays in the scabbard after IjaWipeSheathBayonet", stepM: r.worst, firstM: r.first, visible: sheathed, hipM: hip });
    // c) the comrade's rifle thrown by BlastSlamBuried stays where it fell
    s.Clear();
    e = s.Make("TengxianNra02", "comrade", "BlastSlamBuried");
    e.soldier.openingStoryboardPose = { clip: "BlastSlamBuried", seconds: 1.5 };
    for (let i = 0; i < 40; i++) { e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 }); }
    s.scene.updateMatrixWorld(true);
    const fell = W(e.actor.weaponGroup);
    for (let i = 1; i <= 60; i++) {
      e.soldier.openingStoryboardPose = { clip: "CaptiveDraggedFromDirt", seconds: i / 60 };
      if (i === 30) e.actor.root.position.x += .5;       // the director moves him: the rifle stays
      e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 });
    }
    s.scene.updateMatrixWorld(true);
    const dropped = e.actor.characterRig.openingProps?.droppedObject;
    out.push({ name: "BlastSlamBuried rifle left on the ground", handVisible: e.actor.weaponGroup.visible,
      droppedVisible: dropped?.visible === true, droppedM: dropped ? W(dropped).distanceTo(fell) : Infinity });
    // d) LuoKneelCheck: loops without holdUntil, plays through the rise after it
    s.Clear();
    e = s.Make("TengxianNra05", "luo", "LuoKneelCheck");
    const At = (seconds, holdUntil) => {
      e.soldier.openingStoryboardPose = { clip: "LuoKneelCheck", seconds, holdUntil };
      e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 });
      return e.actor.characterRig.openingStoryboardState?.seconds;
    };
    out.push({ name: "LuoKneelCheck hold loop and release", looped: At(6), released: At(6, 5), end: At(30, 5) });
    // e) an upper-body clip played the way the director is told to (no upperBody field) while he travels: the legs
    // are the native walk (an actor on the same clock with no clip), the arms the clip; upperBody:false = the
    // clip's own legs. Four interpreters stepped in lockstep 0.8 s (past the 0.28 s pose blend), clip time held
    // at 0.9 s (inside the 0.5-1.25 s hold loop).
    s.Clear();
    const travel = 1.6, poses = [{ clip: "InterpreterHurryReach", seconds: .9 }, { clip: "InterpreterHurryReach", seconds: .9, upperBody: true },
      { clip: "InterpreterHurryReach", seconds: .9, upperBody: false }, null];
    const four = poses.map(() => s.Make("TengxianNra02", "interpreter", "InterpreterHurryReach"));
    for (let i = 0; i < 48; i++) four.forEach((e, k) => {
      e.soldier.openingStoryboardTravel = travel; e.soldier.openingStoryboardPose = poses[k] && { ...poses[k] };
      e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 });
    });
    const Diff = (a, b, re) => {
      let worst = 0;
      a.bones.forEach((bone, i) => { if (re.test(bone.name)) worst = Math.max(worst, bone.quaternion.angleTo(b.bones[i].quaternion) * 180 / Math.PI); });
      return worst;
    };
    const LEGS = /Thigh|Calf|Foot|Toe/, ARMS = /UpperArm|Forearm|Hand/;
    out.push({ name: "InterpreterHurryReach without upperBody rides the native legs",
      upperBody: s.api.OpeningClipMeta("InterpreterHurryReach")?.upperBody === true,
      defaultVsTrue: Diff(four[0], four[1], /./), legsVsNative: Diff(four[0], four[3], LEGS), armsVsClip: Diff(four[0], four[2], ARMS),
      falseLegsVsNative: Diff(four[2], four[3], LEGS) });
    // f) a clip this rig was not baked with: the native animation, and the name is on record once
    s.Clear();
    e = s.Make("TengxianNra02", "comrade", "BanterLaugh");
    for (let i = 0; i < 3; i++) {
      e.soldier.openingStoryboardPose = { clip: "NoSuchOpeningClip", seconds: i / 60 };
      e.clock += 1 / 60; e.actor.Update(1 / 60, { elapsed: e.clock, moveSpeed: 0, aim: 0 });
    }
    const missing = s.api.OpeningMissingClips().filter(k => k.endsWith("/NoSuchOpeningClip"));
    out.push({ name: "a clip missing on the rig is reported", missing, windowMissing: (window.__openingMissingClips || []).filter(k => k.endsWith("/NoSuchOpeningClip")).length,
      state: e.actor.characterRig.openingStoryboardState ?? null });
    return out;
  });
  for (const row of runtimeRows) {
    let bad = false, text = "";
    if ("stepM" in row) { bad ||= !(row.firstM <= LIMIT.propFirstM) || !(row.stepM <= LIMIT.propStepM); text += ` first step ${(row.firstM * 100).toFixed(1)} cm, largest step in the blend ${(row.stepM * 100).toFixed(1)} cm`; }
    if ("visible" in row) { bad ||= !row.visible || !(row.hipM < .35); text += ` sheathed ${row.visible} ${(row.hipM * 100).toFixed(0)} cm from the pelvis`; }
    if ("droppedM" in row) { bad ||= row.handVisible || !row.droppedVisible || !(row.droppedM <= .01); text += ` hand weapon visible ${row.handVisible}, dropped copy ${(row.droppedM * 100).toFixed(1)} cm from where it fell`; }
    if ("looped" in row) {
      const meta = plan.clips.find(c => c.name === "LuoKneelCheck");
      const expected = Math.min(meta.duration, .9 + ((5 - .9) % (2.6 - .9)) + 1);   // loop position at holdUntil 5 s, then 1 s on
      bad ||= !(row.looped >= .9 - 1e-6 && row.looped <= 2.6 + 1e-6) || !(Math.abs(row.released - expected) < 1e-3) || !(Math.abs(row.end - meta.duration) < 1e-6);
      text += ` looped @6s ${row.looped?.toFixed(2)} s, released @6s (holdUntil 5) ${row.released?.toFixed(2)} s, @30s ${row.end?.toFixed(2)} s`;
    }
    if ("legsVsNative" in row) {
      bad ||= !row.upperBody || !(row.defaultVsTrue <= .1) || !(row.legsVsNative <= .5) || !(row.armsVsClip <= .5) || !(row.falseLegsVsNative > 2);
      text += ` manifest upperBody ${row.upperBody}; default vs upperBody:true ${row.defaultVsTrue.toFixed(3)}°, legs vs native walk ${row.legsVsNative.toFixed(2)}°,`
        + ` arms vs upperBody:false ${row.armsVsClip.toFixed(2)}°, upperBody:false legs vs native ${row.falseLegsVsNative.toFixed(1)}°`;
    }
    if ("missing" in row) {
      bad ||= row.missing.length !== 1 || row.missing[0] !== "TengxianNra02/NoSuchOpeningClip" || row.windowMissing !== 1 || row.state !== null;
      text += ` recorded ${JSON.stringify(row.missing)} (window ${row.windowMissing}), clip state ${JSON.stringify(row.state)}`;
    }
    if (bad) failed++;
    console.log(`${bad ? "FAIL" : "ok  "} runtime ${row.name}:${text}`);
  }
  if (shots) fs.writeFileSync(path.join(outDir, "Data_OpeningClipsReview.json"), JSON.stringify({ clips: clipRows, player: playerRows, contacts: contactRows, overlaps: overlapRows, runtime: runtimeRows }, null, 2));
  assert.ok(clipRows.length > 0, "no authored clip was reviewed");
  assert.equal(failed, 0, `${failed} opening clip checks failed`);
  console.log(`ok opening clips browser review: ${clipRows.length} clips, ${contactRows.length} paired contacts, ${playerRows.length} player contacts on production rigs`);
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
