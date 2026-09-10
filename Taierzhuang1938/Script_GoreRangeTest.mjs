// 断肢测试场（?gore=1）的真浏览器验收。口径：docs/Data_Dismemberment.md §10.2。
//
// 分两段跑：
//   node Script_GoreRangeTest.mjs --field   只验场地：开机、木桩数与站位、面板、
//                                           引爆炸坑真的伤到人、出图。**不依赖断肢核心。**
//   node Script_GoreRangeTest.mjs           上面这段 + §10.2 的 2–9 条（要 Debug.Gore）。
// 核心还没接上时完整段会明确说「Debug.Gore 未就绪」并以失败退出，不静默跳过。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { GORE_RANGE_POSTS, GORE_LIMB_BUTTONS } from "./Data_GoreRange.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(project, "_shots", "GoreRange");
const fieldOnly = process.argv.includes("--field");
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/fonts|ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push(m.text());
});

/** 页面里通用的小工具，注入一次，两段都用。 */
const HELPERS = `
  window.__gore = {
    Step: (frames, render = false) => Taierzhuang.StepFrames(frames, 1 / 60, render),
    // 一具人身上还剩多少三角形：只数蒙皮网格的 index（断肢就是把 index 改小）。
    BodyTris: (soldier) => {
      let tris = 0;
      soldier?.actor?.root?.traverse?.((node) => {
        if (node.isSkinnedMesh && node.geometry?.index) tris += node.geometry.index.count / 3;
      });
      return tris;
    },
    Named: (prefix) => {
      const out = [];
      Taierzhuang.scene.traverse((node) => { if (node.name?.startsWith(prefix)) out.push(node.name); });
      return out;
    },
    Soldier: (postId) => {
      const state = Taierzhuang.Debug.GoreRange.State();
      const post = state.posts.find((entry) => entry.id === postId);
      return Taierzhuang.ai.soldiers.find((s) => s.id === post?.runtimeId) || null;
    },
    // 把准星对到某个木桩的某一段肢体上（真视线，不是函数调用）。
    AimAt: (postId, limbId) => {
      const point = Taierzhuang.Debug.GoreRange.LimbPoint(postId, limbId);
      if (!point) return null;
      const p = Taierzhuang.player;
      const dx = point[0] - p.position.x, dz = point[2] - p.position.z;
      const dy = point[1] - (p.position.y + p.eyeHeight);
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return point;
    },
    // 世界坐标 → 画面上的一块方框（NDC 走相机自己的投影矩阵，不另算一套）。
    ScreenBox: (point, width, height, half) => {
      const v = Taierzhuang.player.position.clone();
      v.set(point[0], point[1], point[2]).project(Taierzhuang.camera);
      const cx = Math.round((v.x * 0.5 + 0.5) * width);
      const cy = Math.round((1 - (v.y * 0.5 + 0.5)) * height);
      const Clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
      return { x0: Clamp(cx - half, 0, width - 1), x1: Clamp(cx + half, 1, width),
        y0: Clamp(cy - half, 0, height - 1), y1: Clamp(cy + half, 1, height), cx, cy };
    },
    // 画面证据：整幅画面的像素快照（BayonetTest 同一条路）。
    Pixels: () => {
      const src = Taierzhuang.renderer.domElement;
      const canvas = document.createElement("canvas");
      canvas.width = src.width; canvas.height = src.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(src, 0, 0);
      return { w: canvas.width, h: canvas.height, data: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data] };
    },
  };
`;

try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort("blockedbyclient"));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`
    + "?gore=1&shot=1&manual=1&quality=medium&scale=small", { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(
    () => window.Taierzhuang?.state?.ready && window.Taierzhuang?.state?.running
      && window.Taierzhuang?.Debug?.GoreRange, null, { timeout: 180000 });
  await page.evaluate(HELPERS);
  fs.mkdirSync(shots, { recursive: true });
  console.log("PASS 1 开机：?gore=1 建起场地，Debug.GoreRange 已挂");

  // --- 场地段：木桩数与站位 ------------------------------------------------
  const seeded = await page.evaluate(() => {
    window.__gore.Step(30);
    const state = Taierzhuang.Debug.GoreRange.State();
    return {
      posts: state.posts.map((post) => ({ id: post.id, station: post.station, alive: post.alive, x: post.x, z: post.z })),
      live: Taierzhuang.ai.soldiers.filter((s) => s.alive).length,
      dummies: Taierzhuang.ai.soldiers.filter((s) => s.dummy).length,
      placed: Taierzhuang.ai.soldiers.map((s) => ({ id: s.id, x: s.position.x, y: s.position.y, z: s.position.z })),
      ready: state.ready,
    };
  });
  assert.equal(seeded.posts.length, GORE_RANGE_POSTS.length,
    `木桩数不对：${seeded.posts.length} / ${GORE_RANGE_POSTS.length}`);
  assert(seeded.posts.every((post) => post.alive), "开机时全部木桩都该站着");
  assert.equal(seeded.dummies, GORE_RANGE_POSTS.length, "场上的兵必须全是 dummy（不 Think）");
  {
    const byId = new Map(seeded.posts.map((post) => [post.id, post]));
    let worst = 0, worstId = "";
    for (const spec of GORE_RANGE_POSTS) {
      const post = byId.get(spec.id);
      assert(post, `${spec.id} 没撒出来`);
      const runtime = seeded.placed.find((entry) => Math.hypot(entry.x - spec.x, entry.z - spec.z) < 1.2);
      const error = runtime ? Math.hypot(runtime.x - spec.x, runtime.z - spec.z) : 99;
      if (error > worst) { worst = error; worstId = spec.id; }
    }
    assert(worst < 0.6, `木桩被推离表里的坐标：${worstId} 差 ${worst.toFixed(2)} m`);
    console.log(`PASS 2 ${seeded.posts.length} 个木桩全部站在表里的坐标上（最大偏差 ${worst.toFixed(2)} m）`);
  }
  {
    const stands = await page.evaluate(() => Taierzhuang.Debug.GoreRange.Posts()
      .filter((spec) => spec.standY)
      .map((spec) => {
        const soldier = window.__gore.Soldier(spec.id);
        return { id: spec.id, y: soldier?.position.y ?? -99, want: spec.standY };
      }));
    for (const stand of stands) {
      assert(Math.abs(stand.y - stand.want) < 0.12, `刀桩 ${stand.id} 没站在台面上：y=${stand.y}`);
    }
    console.log(`PASS 3 刀桩 ${stands.length} 个都站在 0.30 m 的台面上`);
  }

  // --- 场地段：面板 --------------------------------------------------------
  const panel = await page.evaluate(() => {
    const root = document.querySelector(".goreLab");
    return {
      exists: !!root,
      hudHidden: document.body.classList.contains("goreLabActive"),
      limbs: [...(root?.querySelectorAll(".glLimb") || [])].map((b) => b.dataset.limb),
      buttons: ["glForce", "glReset", "glDetonate", "glSlow", "glRandom"]
        .filter((name) => root?.querySelector("." + name)),
      meters: root?.querySelector(".glMeters")?.textContent || "",
      status: root?.querySelector(".glStatus")?.textContent || "",
    };
  });
  assert(panel.exists && panel.hudHidden, "?shot=1 下面板照建，并盖上 goreLabActive");
  assert.deepEqual(panel.limbs, [...GORE_LIMB_BUTTONS], "每个肢体一个按钮");
  assert.equal(panel.buttons.length, 5, "五颗功能按钮：必断 / 重置 / 引爆 / 慢动作 / 随机");
  assert(panel.meters.length > 0 && panel.status.length > 0, "面板读数不能是空的");
  console.log(`PASS 4 面板齐备：${panel.buttons.length} 颗按钮 + ${panel.limbs.length} 个肢体按钮，读数在写`);

  // --- 场地段：引爆炸坑真的伤到人 ------------------------------------------
  const blast = await page.evaluate(() => {
    const G = Taierzhuang.Debug.GoreRange;
    const Health = () => Object.fromEntries(G.State().posts.map((post) => [post.id, post.health]));
    const before = Health();
    G.Detonate();
    window.__gore.Step(90);
    const after = Health();
    const Drop = (id) => before[id] - after[id];
    return {
      ring1: ["C1_E", "C1_W"].map(Drop),
      ring2: ["C2_S", "C2_N"].map(Drop),
      ring3: ["C3_SE", "C3_NW"].map(Drop),
      line: Drop("L10_1"),
      detonations: G.State().detonations,
    };
  });
  console.log("BLAST", JSON.stringify(blast));
  assert.equal(blast.detonations, 1);
  assert(blast.ring1.every((drop) => drop > 0), "一米环上的木桩必须掉血");
  assert(Math.min(...blast.ring1) >= Math.max(...blast.ring3),
    "一米环吃的伤害不该少于三米环（距离平方衰减）");
  assert.equal(blast.line, 0, "枪线上的木桩离炸坑 25 m 以上，不该被这一发碰到");
  console.log("PASS 5 引爆炸坑走正片 Combat.Blast，一米环伤害 ≥ 三米环，枪线不受影响");

  const restored = await page.evaluate(() => {
    const state = Taierzhuang.Debug.GoreRange.Reset();
    window.__gore.Step(30);
    return { alive: state.posts.filter((post) => post.alive).length, total: state.posts.length };
  });
  assert.equal(restored.alive, restored.total, "重置木桩之后全部重新站好");
  console.log(`PASS 6 重置木桩：${restored.alive}/${restored.total} 重新站好`);

  await page.evaluate(() => {
    Taierzhuang.post.hasPrev = false; Taierzhuang.post.hasTaaHistory = false;
    window.__gore.Step(2, true);
  });
  await page.screenshot({ path: path.join(shots, "Scene_GoreRangeField.png") });
  console.log("PASS 7 出图：_shots/GoreRange/Scene_GoreRangeField.png");

  if (!fieldOnly) {
    // -----------------------------------------------------------------------
    // 完整段（§10.2 的 2–9）：要断肢核心（Debug.Gore）
    // -----------------------------------------------------------------------
    const coreReady = await page.evaluate(() => !!window.Taierzhuang?.Debug?.Gore?.State);
    assert(coreReady, "Debug.Gore 未就绪：断肢核心还没接上，只能先跑 --field 段");

    // 2. 直接卸一段：三角数守恒 + 场景里出现 GorePart / GoreCap + 落地静止 + 不换远景层
    const direct = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      const soldier = window.__gore.Soldier("L10_1");
      const before = window.__gore.BodyTris(soldier);
      Gore.Sever(soldier.id, "forearmL");
      window.__gore.Step(2);
      const after = window.__gore.BodyTris(soldier);
      const state = Gore.State();
      const part = state.parts.find((entry) => entry.limb === "forearmL");
      const names = { parts: window.__gore.Named("GorePart_"), caps: window.__gore.Named("GoreCap_") };
      // 360 帧 = 6 s：BUDGET.restToStaticS 是 2.5 s **静下来之后**才开始算，
      // §10.2 里写的 120 帧（2 s）根本等不到 resting，那一句是笔误。
      window.__gore.Step(360);
      const settled = Gore.State().parts.find((entry) => entry.id === part?.id) || null;
      // 远景层：把玩家挪到 45 m 外，尸体不许被换成整人的远景桶（会把胳膊长回来）。
      T.player.Spawn(soldier.position.x, soldier.position.z + 45, 0);
      window.__gore.Step(30);
      return {
        before, after, part, settled, names,
        severed: Gore.State().severed.find((entry) => entry.soldierId === soldier.id)?.limbs || [],
        renderLod: soldier.renderLod ?? null, distance: 45,
      };
    });
    console.log("SEVER", JSON.stringify({ ...direct, names: { parts: direct.names.parts.length, caps: direct.names.caps.length } }));
    assert(direct.after < direct.before, `身上的三角数必须变少：${direct.before} → ${direct.after}`);
    assert(direct.names.parts.some((name) => name.startsWith("GorePart_forearmL")),
      "场景里要有 GorePart_forearmL_*：" + direct.names.parts.join(","));
    assert(direct.names.caps.length > 0, "断口要盖 GoreCap_*");
    assert(direct.severed.includes("forearmL"));
    assert(direct.settled?.resting, "肢块落地静止之后该转成 resting");
    assert(Math.abs(direct.settled?.at?.[1] ?? 99) < 0.25,
      `肢块该停在地面上，实际 y=${direct.settled?.at?.[1]}`);
    assert(direct.renderLod !== "far" && direct.renderLod !== "crowd",
      `断过肢的兵不许换远景层，实际 ${direct.renderLod}`);
    console.log("PASS 8 直接卸一段：身体三角数下降、GorePart/GoreCap 就位、肢块落地静止、45 m 外不换远景层");

    // 3. 真枪链：SetForce("bullet") → 瞄左前臂 → 真开火
    const shot = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      const attempts = [];
      // 站近 + 开镜再打：13 m 外的腰际射击散布有半米以上，打中的是小腿还是前臂
      // 全看骰子 —— 那测的是散布，不是断肢链。
      for (let i = 0; i < 3 && !attempts.some((entry) => entry.severed.includes("forearmL")); i += 1) {
        G.Reset(); window.__gore.Step(10);
        Gore.SetForce("bullet");
        T.player.Spawn(3332, 3352, 0); window.__gore.Step(10);
        T.Debug.Mouse(2, true); window.__gore.Step(45);
        const aimed = window.__gore.AimAt("L10_1", "forearmL");
        window.__gore.Step(8);
        T.Debug.Mouse(0, true); window.__gore.Step(2); T.Debug.Mouse(0, false);
        window.__gore.Step(60);
        T.Debug.Mouse(2, false); window.__gore.Step(4);
        const soldier = window.__gore.Soldier("L10_1");
        attempts.push({
          aimed, ads: T.player.ads, alive: soldier?.alive, health: soldier?.health,
          severed: Gore.State().severed.find((entry) => entry.soldierId === soldier?.id)?.limbs || [],
          force: Gore.State().force ?? null,
        });
      }
      return attempts;
    });
    console.log("SHOT", JSON.stringify(shot));
    const hit = shot.find((entry) => entry.severed.includes("forearmL")) || shot.at(-1);
    assert(hit.aimed, "拿不到 forearmL 的世界位置");
    assert.equal(hit.alive, false, "被卸掉一段肢体的兵必须死");
    assert(hit.severed.includes("forearmL"),
      `真枪打中左前臂应卸掉它，${shot.length} 次都没中：` + JSON.stringify(shot.map((e) => e.severed)));
    assert(!hit.force, "Force 打完一发要自动清空");
    console.log("PASS 9 真枪链：必断开关 + 真开火 + 死亡链，命中的那一段被卸掉");

    // 4. 爆炸链：一米环 ≥ 2 段，三米环 ≤ 1 段
    const blastSever = await page.evaluate(() => {
      const G = Taierzhuang.Debug.GoreRange, Gore = Taierzhuang.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      G.Detonate(); window.__gore.Step(120);
      const state = G.State();
      const Count = (id) => state.posts.find((post) => post.id === id)?.severed.length ?? -1;
      return {
        ring1: ["C1_E", "C1_W"].map(Count), ring3: ["C3_SE", "C3_NW"].map(Count),
        budget: Gore.State().budget,
      };
    });
    console.log("BLAST_SEVER", JSON.stringify(blastSever));
    assert(Math.max(...blastSever.ring1) >= 2, "一米环上至少有一个木桩被卸掉两段以上");
    assert(Math.max(...blastSever.ring3) <= 1,
      "三米环上最多卸一段（爆炸的断肢段数要随 falloff 收：见 Data_Dismemberment §10.2-4）："
      + JSON.stringify(blastSever.ring3));
    console.log("PASS 10 爆炸链：一米环多段、三米环最多一段");

    // 5. 大刀链
    const blade = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      Gore.SetForce("blade");
      if (T.state.activeSlot !== "melee") T.Debug.Key("Digit3");
      window.__gore.Step(20);
      const post = G.Posts().find((spec) => spec.station === "GoreBlade");
      T.player.Spawn(post.x, post.z + 0.95, 0); window.__gore.Step(10);
      window.__gore.AimAt(post.id, "upperArmR");
      for (let i = 0; i < 6; i += 1) {
        // 点按 = 轻击（按住会变成蓄力重击，节奏完全不同），与 MeleeQteTest 同一条路。
        T.Debug.Mouse(0, true); T.Debug.Mouse(0, false);
        window.__gore.Step(45);
        const soldier = window.__gore.Soldier(post.id);
        const cut = Gore.State().severed.find((entry) => entry.soldierId === soldier?.id)?.limbs || [];
        if (cut.length) return { post: post.id, cut, weapon: T.state.activeSlot, swings: i + 1 };
      }
      const soldier = window.__gore.Soldier(post.id);
      return { post: post.id, cut: [], weapon: T.state.activeSlot, health: soldier?.health, swings: 6 };
    });
    console.log("BLADE", JSON.stringify(blade));
    assert(blade.cut.some((limb) => /^(upperArm|forearm|head)/.test(limb)),
      "大刀劈砍应卸掉上臂/前臂/头之一（白刃那一支要把命中部位交给规则层）：" + JSON.stringify(blade));
    console.log("PASS 11 大刀链：劈中的那一段被卸掉");

    // 6. 预算：连续卸超过上限，同屏肢块钉在 maxParts
    const budget = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      const max = Gore.State().budget.max;
      // 只卸「根段」：卸了 upperArmL 之后 forearmL 已经在同一棵子树里没了，
      // 再点它一次不会多出一块肢块 —— 拿全部九段去凑数会凑不满预算。
      const roots = ["upperArmL", "upperArmR", "thighL", "thighR", "head"];
      let issued = 0;
      for (const post of G.State().posts) {
        for (const limb of roots) {
          const soldier = window.__gore.Soldier(post.id);
          if (!soldier) continue;
          Gore.Sever(soldier.id, limb);
          issued += 1;
          window.__gore.Step(1);
          if (issued > max + 6) break;
        }
        if (issued > max + 6) break;
      }
      window.__gore.Step(5);
      return { max, issued, live: Gore.State().budget.live };
    });
    console.log("BUDGET", JSON.stringify(budget));
    assert(budget.issued > budget.max, "要卸得比上限多才测得出预算");
    assert.equal(budget.live, budget.max, "同屏肢块必须钉在预算上限");
    console.log(`PASS 12 预算：连开 ${budget.issued} 段，同屏保持 ${budget.live}/${budget.max}`);

    // 7. 内容开关关掉之后一段都不掉
    const disabled = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      Gore.SetEnabled(false);
      const soldier = window.__gore.Soldier("L25_1");
      const before = window.__gore.BodyTris(soldier);
      const result = Gore.Sever(soldier.id, "thighR");
      window.__gore.Step(10);
      const after = window.__gore.BodyTris(soldier);
      const parts = window.__gore.Named("GorePart_").length;
      Gore.SetEnabled(true);
      return { before, after, parts, severed: result?.severed?.length ?? 0 };
    });
    assert.equal(disabled.after, disabled.before, "关掉断肢之后身体三角数不许变");
    assert.equal(disabled.parts, 0, "关掉断肢之后场上不许有肢块");
    console.log("PASS 13 SetEnabled(false)：一段都不掉，身体三角数不变");

    // 8. 释放：Reset 之后身体全部长回来、场上干净
    const released = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      // 完好的三角数**按模型号分档**（十套 GLB 各不相同），而重置会重新撒一批兵、
      // 重新抽模型号。所以判据不是「逐个对上一轮的数」，而是「每一具都还是某个
      // 完好档位」—— 身上少一段的那种数字一定不在这张表里。
      const pristine = G.State().posts.map((post) => window.__gore.BodyTris(window.__gore.Soldier(post.id)));
      const soldier = window.__gore.Soldier("L10_3");
      const cutFrom = window.__gore.BodyTris(soldier);
      Gore.Sever(soldier.id, "thighL"); Gore.Sever(soldier.id, "upperArmR");
      window.__gore.Step(30);
      const cutTo = window.__gore.BodyTris(window.__gore.Soldier("L10_3"));
      G.Reset(); window.__gore.Step(20);
      const after = G.State().posts.map((post) => window.__gore.BodyTris(window.__gore.Soldier(post.id)));
      return {
        pristine: [...new Set(pristine)].sort((x, y) => x - y), after, cutFrom, cutTo,
        parts: window.__gore.Named("GorePart_").length, caps: window.__gore.Named("GoreCap_").length,
        severed: Gore.State().severed.length, live: Gore.State().budget.live,
      };
    });
    console.log("RELEASE", JSON.stringify({ ...released, after: undefined }));
    assert(released.cutTo < released.cutFrom, "先得真的卸掉两段，这一条才测得出释放");
    const pristine = new Set(released.pristine);
    const holed = released.after.filter((count) => !pristine.has(count));
    assert.equal(holed.length, 0, `重置之后还有 ${holed.length} 具身体没长回来：${holed.join(",")}`);
    assert.equal(released.parts, 0, "重置之后场上不许留 GorePart");
    assert.equal(released.caps, 0, "重置之后场上不许留 GoreCap");
    assert.equal(released.severed, 0);
    console.log("PASS 14 释放：三角数全部回到原值，场上没有残留的肢块与断面");

    // 9. 三张证据图 + 像素证据（装上了得看得见）
    const evidence = await page.evaluate(() => {
      const T = Taierzhuang, G = T.Debug.GoreRange, Gore = T.Debug.Gore;
      G.Reset(); window.__gore.Step(10);
      T.player.Spawn(3340, 3352.5, 0);
      window.__gore.AimAt("L10_3", "upperArmR");
      T.post.hasPrev = false; T.post.hasTaaHistory = false;
      window.__gore.Step(8, true);
      const before = window.__gore.Pixels();
      const soldier = window.__gore.Soldier("L10_3");
      // 只数**那一段肢体投影出来的那一小块**：整幅画面的差异会把血雾、TAA 抖动
      // 和天光变化一起算进来，那样再看不见的东西也能"通过"。
      const box = window.__gore.ScreenBox(G.LimbPoint("L10_3", "upperArmR"), before.w, before.h, 70);
      Gore.Sever(soldier.id, "upperArmR");
      window.__gore.Step(4, true);
      const after = window.__gore.Pixels();
      let changed = 0, sampled = 0;
      for (let y = box.y0; y < box.y1; y += 1) {
        for (let x = box.x0; x < box.x1; x += 1) {
          const i = (y * before.w + x) * 4;
          sampled += 1;
          if (Math.abs(before.data[i] - after.data[i]) + Math.abs(before.data[i + 1] - after.data[i + 1])
            + Math.abs(before.data[i + 2] - after.data[i + 2]) > 24) changed += 1;
        }
      }
      return { changed, sampled, box, pixels: before.w * before.h };
    });
    console.log("PIXELS", JSON.stringify(evidence));
    assert(evidence.sampled > 10000, "取样框落到画面外了：" + JSON.stringify(evidence.box));
    assert(evidence.changed > 200,
      `卸掉一整条上臂在画面上必须看得见，那一小块里只差了 ${evidence.changed} / ${evidence.sampled} 像素`);
    await page.screenshot({ path: path.join(shots, "Scene_GoreSevered.png") });
    await page.evaluate(() => { window.__gore.Step(150, true); });
    await page.screenshot({ path: path.join(shots, "Scene_GoreRested.png") });
    await page.evaluate(() => {
      const G = Taierzhuang.Debug.GoreRange;
      G.Reset(); window.__gore.Step(10);
      Taierzhuang.player.Spawn(3364, 3344, 0);
      G.Detonate(); window.__gore.Step(45, true);
    });
    await page.screenshot({ path: path.join(shots, "Scene_GoreCrater.png") });
    console.log("PASS 15 三张证据图 + 像素证据（差异 " + evidence.changed + " 像素）");
  }

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(fieldOnly ? "PASS 断肢测试场：场地段全绿" : "PASS 断肢测试场：场地 + 断肢链全绿");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
