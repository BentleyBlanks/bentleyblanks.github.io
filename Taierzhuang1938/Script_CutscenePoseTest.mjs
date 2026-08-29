// 蒙皮姿态契约：躺的人要躺着、跪的人要跪着、站的人要站着 —— 拿骨骼世界坐标量，不看图。
// 用法：node Taierzhuang1938/Script_CutscenePoseTest.mjs
//
// 这条测试守三样东西，缺一样都能让「验收阻塞级」的回归悄悄回来：
//
//  1) **clip 名不可信，位置可信**。源 FBX 的文件名与里面的动作对不上号
//     （StandFireCrouch 其实是匍匐，ProneFire 其实是站姿甩臂，RifleIdle 其实是
//     单膝跪地）。Script_CharacterModel 的 POSE_CLIPS 是按实测重新对上的号；
//     这里逐条量骨头高度，重烘一批动作资产又把姿态换了位置，先红在这儿。
//  2) **姿态优先级**：躺 ＞ 跪/蹲 ＞ 手势。手势素材只有站姿，排在姿态前面就会
//     把跪着包扎的军医、躺在门板上的伤员一起拉站起来（2026-08-29 的那次回归）。
//  3) **三场过场的实机高度**：Ch4 救护所、Ch5 折返、Ch6 最后电报，逐人量头骨。
//
// 量的是「骨头世界 Y − 演员 root 世界 Y」，也就是**离这个人自己脚下平面多高**；
// 罗班长躺在门板担架上（root y=0.33），所以他的门槛比地上的伤员高一截。
//
// ===========================================================================
// 【2026-08-29 起这条测试是红的，红得有据：v3 蒙皮资产把胯的位移轨道烘没了】
//
// 合并 master 的并行批（80fac555 / dddd54d9 / ebc9b03b 重导动作 + 清单 v3）之后，
// 这条测试 22 红。**不是判据过时，也不是合并没合好** —— 是资产里少了东西：
//
//   · 十六条 clip 的胯高实测**全是同一个数 0.846**（v1 上是 0.02–0.69 逐条不同）；
//     头最低的一条也有 1.06 m，也就是说**没有任何一条 clip 能把人放到地上**。
//   · 直接证据在 GLB 里：v1 的 `Bip002 Pelvis.position` 逐条 clip 都在动
//     （StandFireCrouch 幅度 17.07 / LeanWallSitPeek 1.17 / AdvanceFire 14.63），
//     v3 里这条轨道**全零**；顶替它的 `GroundRoot.position` 十六条里只有
//     ProneFire 一条非零。两份 GLB 都在 git 里，拿 glTF 解析器一读就复现。
//   · 烘焙脚本的贴地补偿是 `max(0.0, -currentGroundZ)`：只把陷进地里的帧往上顶，
//     不把人往下放。所以「胯被冻在站立高度」反而让清单里那条
//     maxGroundPenetrationMeters ≤ 2 mm 的审计**轻松通过** ——
//     它量的是「有没有陷进地里」，不是「姿势对不对」。这就是它漏过去的原因。
//   · 后果是看得见的：救护所里躺担架的四个伤员头高 1.06–1.13 m（该 0.1–0.5），
//     跪着的军医头高 1.08 m（该 0.45–1.0）—— 一屋子人全站着。
//
// **不要靠放宽下面的高度带来把它修绿。** 那等于承认「趴在担架上的人头可以在
// 1.1 m」，等于把这道闸拆掉 —— 而这道闸正是 2026-08-29 那次「手势把躺着的人
// 拉站起来」回归唯一抓住它的东西。运行时也补不回来：位移信息不在资产里了。
// 修法只有一条：**重烘一批带胯位移的动作资产**（_import/Script_BakeLugouCharacters）。
// 重烘之后先跑这条测试，再按实测把 Script_CharacterModel 的 POSE_CLIPS 头注更新。
//
// 顺带一提：站姿三条（standIdle / standFire / standReach）现在量到的头高比 v1
// 高 0.1–0.2 m，那是**好的那一半** —— v3 的离线贴地把人正确地放回了地面，
// 不再被运行时那套脚踝标定往下拽。等重烘之后这三条的带子大概也要跟着上抬，
// 但现在不动：把真修好的数和坏掉的基线混在一起，信号就读不出来了。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

/** 每个姿态 clip 的骨骼高度带（离脚下平面，米）。上下界按实测留了余量。*/
const CLIP_BANDS = {
  proneFire: { head: [0.10, 0.50], pelvis: [-0.05, 0.30], why: "匍匐据枪：整个人贴地" },
  crouchIdle: { head: [0.45, 1.00], pelvis: [0.20, 0.60], why: "跪蹲俯身" },
  crouchFire: { head: [0.45, 1.00], pelvis: [0.20, 0.60], why: "蹲姿据枪" },
  standIdle: { head: [1.00, 1.45], pelvis: [0.45, 0.85], why: "站姿据枪：真站着" },
  standFire: { head: [1.00, 1.45], pelvis: [0.45, 0.85], why: "站姿射击" },
  standReach: { head: [1.00, 1.45], pelvis: [0.45, 0.85], why: "站姿伸手/挥臂" },
  sit: { head: [0.35, 0.75], pelvis: [-0.10, 0.20], why: "坐在地上" },
  run: { head: [0.95, 1.35], pelvis: [0.42, 0.80], why: "持枪跑步" },
};

/** 过场实机门槛。head 是「离本人 root 平面」的高度。 */
const CUTSCENE_CASES = [
  {
    cut: "CS_Ch4_AidStation",
    samples: [
      {
        t: 12.0,
        actors: {
          luo: { clip: "proneFire", head: [0.10, 0.50], why: "罗班长躺在门板担架上" },
          wounded1: { clip: "proneFire", head: [0.10, 0.50], why: "地上躺着的伤员" },
          wounded2: { clip: "proneFire", head: [0.10, 0.50], why: "地上躺着的伤员" },
          wounded3: { clip: "proneFire", head: [0.10, 0.50], why: "地上躺着的伤员" },
          junyi: { clip: "crouchIdle", head: [0.45, 1.00], why: "军医跪在担架东侧动手（kneel 0.9 + reach 0.45）" },
        },
      },
      {
        t: 24.0,
        actors: {
          newWounded: { clip: "proneFire", head: [0.10, 0.50], why: "新抬进来的伤员" },
          junyi: { clip: "crouchIdle", head: [0.45, 1.00], why: "军医转过去跪下（kneel 0.8 + reach 0.45）" },
        },
      },
    ],
  },
  {
    cut: "CS_Ch5_TurnBack",
    samples: [
      {
        t: 6.0,
        actors: {
          shangbing: { clip: "proneFire", head: [0.10, 0.50], why: "担架上的伤员" },
          danjia_a: { clip: "crouchIdle", head: [0.45, 1.00], why: "跪着的担架员（kneel 1 + reach 0.4）" },
          danjia_b: { clip: "crouchIdle", head: [0.45, 1.00], why: "蹲着的担架员（crouch 0.7 + reach 0.5）" },
        },
      },
    ],
  },
  {
    cut: "CS_Ch6_LastWire",
    samples: [
      {
        t: 2.0,
        actors: {
          wangmingzhang: { clip: "standIdle", head: [1.00, 1.45], why: "王铭章站在桌东侧（crouch 0 / reach 0）" },
          canmou: { clip: "standReach", head: [1.00, 1.45], why: "参谋站着念电文（reach 0.32）" },
        },
        // 同一个 kind 的两个人站在同一间屋里，头不许差出一个姿态来
        pairs: [["wangmingzhang", "canmou", 0.25]],
      },
    ],
  },
];

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const port = server.address().port;
let page;
const failures = [];
const Report = (rows) => { for (const row of rows) console.log(`  ${row}`); };

try {
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  // ── 1 + 2：clip 高度带与姿态优先级（不建关，几秒钟）──────────────────────
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?poseTest=1`, {
    waitUntil: "load", timeout: 120000,
  });
  await page.waitForFunction(() => window.Taierzhuang?.actorFactory, null, { timeout: 300000 });
  const unit = await page.evaluate(async (bands) => {
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const { LUGOU_POSE_CLIPS } = await import("/Taierzhuang1938/Script_CharacterModel.mjs");
    const factory = window.Taierzhuang.actorFactory;
    const actor = factory.Create("nra", { seed: 41938, weapon: null });
    const rig = actor.characterRig;
    const v = new THREE.Vector3();
    const problems = [];
    const table = [];
    // 一个 clip 在自己整段时长上都得留在带里：只查一帧的话，
    // 「前一秒趴着、后两秒站起来」这种素材照样能蒙混过去。
    for (const [pose, band] of Object.entries(bands)) {
      const clipId = LUGOU_POSE_CLIPS[pose];
      if (!clipId) { problems.push(`POSE_CLIPS 缺 ${pose}`); continue; }
      const clip = rig.clipById.get(clipId);
      if (!clip) { problems.push(`${pose} → ${clipId}：没有这个 clip`); continue; }
      const seen = { head: [Infinity, -Infinity], pelvis: [Infinity, -Infinity] };
      for (let i = 0; i <= 8; i += 1) {
        const at = (clip.duration * i) / 8;
        rig.mixer.stopAllAction();
        rig.currentAction = null;
        rig.currentId = null;
        rig.Play(clipId, 0);
        rig.mixer.setTime(at);
        actor.root.updateWorldMatrix(true, true);
        for (const role of ["head", "pelvis"]) {
          const y = rig.bones[role].getWorldPosition(v).y - actor.root.position.y;
          seen[role][0] = Math.min(seen[role][0], y);
          seen[role][1] = Math.max(seen[role][1], y);
        }
      }
      table.push(`${pose.padEnd(11)} → ${clipId.padEnd(19)} 头 ${seen.head[0].toFixed(2)}–${seen.head[1].toFixed(2)}  胯 ${seen.pelvis[0].toFixed(2)}–${seen.pelvis[1].toFixed(2)}   ${band.why}`);
      for (const role of ["head", "pelvis"]) {
        const [lo, hi] = band[role];
        if (seen[role][0] < lo || seen[role][1] > hi) {
          problems.push(`${pose}（${clipId}）${role} 实测 ${seen[role][0].toFixed(3)}–${seen[role][1].toFixed(3)}，`
            + `要求 ${lo}–${hi}：${band.why}`);
        }
      }
    }
    // 姿态优先级：手势不许把躺着/跪着的人拉站起来
    rig.forcedClip = null;
    const P = LUGOU_POSE_CLIPS;
    const cases = [
      [{ prone: 1 }, P.proneFire, "躺着"],
      [{ prone: 1, reach: 0.5 }, P.proneFire, "躺着伸手"],
      [{ prone: 1, throwing: 0.6 }, P.proneFire, "躺着投弹"],
      [{ prone: 1, firing: true }, P.proneFire, "卧倒射击（正片 AI 走这条）"],
      [{ kneel: 0.9, reach: 0.45 }, P.crouchIdle, "跪着伸手"],
      [{ crouch: 0.7, reach: 0.5 }, P.crouchIdle, "蹲着伸手"],
      [{ crouch: 0.6, firing: true }, P.crouchFire, "蹲姿射击"],
      [{ kneel: 0.9, melee: 0.5 }, P.crouchIdle, "跪着白刃"],
      [{ reach: 0.4 }, P.standReach, "站着伸手"],
      [{ moveSpeed: 0.5 }, P.run, "跑"],
      [{ moveSpeed: 0 }, P.standIdle, "站着待着"],
      [{ firing: true }, P.standFire, "站姿射击"],
      [{ sit: 1 }, P.sit, "坐着"],
    ];
    for (const [state, want, why] of cases) {
      const got = rig._ActionForState(state);
      if (got !== want) problems.push(`优先级：${why} 应取 ${want}，实际 ${got}`);
    }
    // 卧倒的机枪手仍走机枪那一段（手里那挺枪不能飞）
    actor.weaponData = { rpm: 500 };
    if (rig._ActionForState({ prone: 1, firing: true }) !== P.machineGunFire) {
      problems.push("优先级：卧倒机枪手应仍取机枪射击");
    }
    actor.weaponData = null;
    actor.Dispose();
    return { problems, table };
  }, CLIP_BANDS);
  console.log("clip 高度带（整段时长的极值）：");
  Report(unit.table);
  failures.push(...unit.problems);

  // ── 3：三场过场的实机高度 ────────────────────────────────────────────────
  // 用同一个已建好的场跑三场：这条测试只看骨骼坐标，脚下是哪一关的地形不影响
  // 演员的姿态（出图要对机位才必须按 trigger 选关，那是 Script_CutsceneShot 的事）。
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&manual=1&phase=4&quality=medium&scale=medium`, {
    waitUntil: "load", timeout: 180000,
  });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(90));
  await page.evaluate(() => { window.Taierzhuang.state.running = false; });

  for (const testCase of CUTSCENE_CASES) {
    const started = await page.evaluate(async (id) => {
      const D = window.Taierzhuang;
      D.Debug.PlayCutscene(id).catch(() => null);
      return D.Debug.Cutscene().playing;
    }, testCase.cut);
    if (!started) { failures.push(`${testCase.cut}：过场没播起来`); continue; }
    let now = 0;
    for (const sample of testCase.samples) {
      await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false),
        Math.max(0, Math.round((sample.t - now) * 60)));
      now = sample.t;
      const measured = await page.evaluate(() => {
        const D = window.Taierzhuang;
        const out = {};
        for (const [id, entry] of D.cutscene.actors) {
          const a = entry.actor;
          a.root.updateWorldMatrix(true, true);
          const rig = a.characterRig;
          if (!rig) continue;
          const Y = (role) => (rig.bones[role]
            ? +(rig.bones[role].matrixWorld.elements[13] - a.root.position.y).toFixed(3) : null);
          out[id] = { clip: rig.currentId, head: Y("head"), pelvis: Y("pelvis"), rootY: +a.root.position.y.toFixed(3) };
        }
        return out;
      });
      console.log(`${testCase.cut} t=${sample.t}：`);
      const rows = [];
      for (const [id, want] of Object.entries(sample.actors)) {
        const got = measured[id];
        if (!got) { failures.push(`${testCase.cut} t=${sample.t}：找不到演员 ${id}`); continue; }
        rows.push(`${id.padEnd(14)} clip=${String(got.clip).padEnd(17)} 头 ${String(got.head).padStart(6)} `
          + `（root ${got.rootY}）  期望 ${want.head[0]}–${want.head[1]}   ${want.why}`);
        const wantClip = await page.evaluate(async (pose) => {
          const { LUGOU_POSE_CLIPS } = await import("/Taierzhuang1938/Script_CharacterModel.mjs");
          return LUGOU_POSE_CLIPS[pose];
        }, want.clip);
        if (got.clip !== wantClip) {
          failures.push(`${testCase.cut} t=${sample.t} ${id}：应取 ${want.clip}(${wantClip})，实际 ${got.clip}（${want.why}）`);
        }
        if (got.head < want.head[0] || got.head > want.head[1]) {
          failures.push(`${testCase.cut} t=${sample.t} ${id}：头骨离脚下平面 ${got.head} m，`
            + `要求 ${want.head[0]}–${want.head[1]}（${want.why}）`);
        }
      }
      Report(rows);
      for (const [a, b, tolerance] of sample.pairs || []) {
        const delta = Math.abs(measured[a].head - measured[b].head);
        if (delta > tolerance) {
          failures.push(`${testCase.cut} t=${sample.t}：${a} 与 ${b} 头高差 ${delta.toFixed(3)} m，`
            + `超过 ${tolerance}（同一间屋里同一个 kind，站姿要一致）`);
        }
      }
    }
    await page.evaluate(() => window.Taierzhuang.Debug.SkipCutscene());
    await page.evaluate(() => window.Taierzhuang.StepFrames(30, 1 / 60, false));
  }
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`CutscenePoseTest: FAIL（${failures.length} 条）`);
  for (const line of failures) console.error(`  ✗ ${line}`);
  process.exit(1);
}
console.log("CutscenePoseTest: PASS — 8 个姿态 clip 的高度带、14 条优先级、三场过场逐人头高");
