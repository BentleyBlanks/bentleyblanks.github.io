// Script_CharacterSurfaceShots.mjs - 人物表面（军装 / 皮肤 / 泥污 / 头盔 / 第一人称手）实机对照出图。
// 在第一关真场景（?whitebox=p012，全套后处理与天光）里就地摆几具人，拍四类图，写进忽略目录：
//   Lineup.png     六款批准外观全身一排（NRA02 / NRA05 / IJA01 / IJA02 / IJA03 / IJA06）
//   Face_<id>.png  头肩特写（NRA05、IJA06、IJA02 钢盔）
//   Legs_<id>.png  膝下特写（绑腿 / 皮鞋 / 下半身泥）
//   Hands.png      第一人称手（持枪待机，视模可见）
// 用法（从 worktree 根）：
//   node Taierzhuang1938/Script_CharacterSurfaceShots.mjs [--out=<dir>] [--root=<另一棵树的根>]
//        [--quality=high] [--stage=6] [--only=Lineup,Face_TengxianIja06]
// --root 用来拍改前基线（git worktree add --detach <dir> <起点提交>），脚本本身留在本树。
// 出图脚本不是门禁，不进 TestRunner。口径见 docs/Data_CharacterStandard.md「人物表面」一节。
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const WT = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(arg("root") || WT);
const out = path.resolve(arg("out") || WT + "Taierzhuang1938/_shots/CharacterSurface");
const quality = ["low", "medium", "high", "ultra"].includes(arg("quality")) ? arg("quality") : "high";
const stage = Number(arg("stage") || 6);
const only = arg("only")?.split(",").filter(Boolean) || null;
fs.mkdirSync(out, { recursive: true });

// 人都空手（持枪待机的枪托会挡脸，且摆姿势不稳定）。
// 拍摄地：在 06 集结处周边的格点里现场找一块平地（运行时地面含壕沟开挖与弃土），
// 镜头背对太阳（人脸迎光），前方 8 m × 9 m 内没有实心体块。
const SEARCH = { minX: -72, maxX: 12, minZ: -136, maxZ: -60, step: 3 };
const LINEUP = [
  { kind: "nra", modelVariant: 1, id: "TengxianNra02" },
  { kind: "nra", modelVariant: 4, id: "TengxianNra05" },
  { kind: "ija", modelVariant: 0, id: "TengxianIja01" },
  { kind: "ija", modelVariant: 1, id: "TengxianIja02" },
  { kind: "ija", modelVariant: 2, id: "TengxianIja03" },
  { kind: "ija", modelVariant: 5, id: "TengxianIja06" },
];
const FACES = ["TengxianNra05", "TengxianNra02", "TengxianIja06", "TengxianIja02"];
const LEGS = ["TengxianNra05", "TengxianIja06"];
const Want = (name) => !only || only.includes(name);

const { LaunchBrowser } = await import(pathToFileURL(WT + "PrairieFire1937/Script_BrowserTestKit.mjs").href);
const { ServeRoot } = await import(pathToFileURL(WT + "Taierzhuang1938/Script_DevServer.mjs").href);
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const log = { root, quality, stage, shots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  // 着色器编译 / 链接失败只在控制台留一行（three 的 WebGLProgram 报错），一并收进日志。
  page.on("console", (m) => { if (m.type() === "error" || /Shader Error|WebGLProgram|MaterialPatches/.test(m.text())) errors.push(m.text().slice(0, 600)); });
  const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=${stage}&quality=${quality}&scale=small`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(() => window.Tengxian.StepFrames(90));
  // 第一人称手：开编辑器之前按玩家自己的视角拍（编辑器的飞行相机不带视模）。
  if (Want("Hands")) {
    await page.evaluate(() => { const T = window.Tengxian; T.Debug.Look(0, 160); T.StepFrames(40); });
    await page.screenshot({ path: path.join(out, "Hands.png") });
    log.shots.push({ name: "Hands" }); console.log("shot Hands");
  }
  await page.evaluate(() => window.Tengxian.Debug.OpenEditor("samplePoints"));
  const L = await import(pathToFileURL(root.replace(/\\/g, "/") + "/Taierzhuang1938/Data_FirstLevelMissionLayout.mjs").href);
  const solids = L.MISSION_LAYOUT.blocks.filter((b) => b.solid !== false)
    .map((b) => ({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 }));
  const SITE = await page.evaluate(({ search, solids }) => {
    const T = window.Tengxian;
    const sun = T.lights.sun, dir = sun.position.clone().sub(sun.target.position);
    // 镜头朝向 = 太阳水平方向的反向（人面朝镜头 = 迎着太阳）。
    const yaw = Math.atan2(dir.x, dir.z);
    const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const H = (x, z) => T.battlefield.TerrainHeight(x, z);
    let best = null;
    for (let x = search.minX; x <= search.maxX; x += search.step) for (let z = search.minZ; z <= search.maxZ; z += search.step) {
      const hs = [];
      let blocked = false;
      for (let a = 0; a <= 9; a += 1) for (let s = -4; s <= 4; s += 1) {
        const px = x + fwd.x * a + right.x * s, pz = z + fwd.z * a + right.z * s;
        hs.push(H(px, pz));
        if (solids.some((b) => Math.hypot(b.x - px, b.z - pz) < b.r + 0.4)) blocked = true;
      }
      if (blocked) continue;
      const span = Math.max(...hs) - Math.min(...hs);
      if (!best || span < best.span) best = { x, z, span };
    }
    return best && { ...best, yawDeg: yaw * 180 / Math.PI };
  }, { search: SEARCH, solids });
  log.site = SITE;
  console.log("site", JSON.stringify(SITE));
  // 摆人：全部在同一处造好，按镜头挪位置；每具人跑几帧待机让骨骼落定。
  await page.evaluate(async ({ lineup }) => {
    const T = window.Tengxian;
    window.__surfaceActors = {};
    for (const [index, entry] of lineup.entries()) {
      const actor = T.actorFactory.Create(entry.kind, { seed: 7300 + index * 11, modelVariant: entry.modelVariant, weapon: null, noPool: true });
      T.scene.add(actor.root);
      actor.root.visible = true;
      window.__surfaceActors[entry.id] = actor;
    }
  }, { lineup: LINEUP });

  const Shoot = async (name, { camera, actors, viewmodel = false, focus = null }) => {
    if (!Want(name)) return;
    const res = await page.evaluate(({ camera, actors, viewmodel, focus }) => {
      const T = window.Tengxian, ed = T.editor.active, D = Math.PI / 180;
      const ground = (x, z) => T.battlefield.TerrainHeight?.(x, z) ?? 0;
      for (const actor of Object.values(window.__surfaceActors)) actor.root.visible = false;
      const pose = ed.ApplyPose({ id: "surface", x: camera.x, z: camera.z, y: null, h: camera.h,
        yaw: camera.yawDeg * D, pitch: camera.pitchDeg * D, fov: camera.fov, phase: null, far: null });
      for (const a of actors) {
        const actor = window.__surfaceActors[a.id];
        if (!actor) continue;
        actor.root.position.set(a.x, ground(a.x, a.z), a.z);
        actor.root.rotation.set(0, a.yawDeg * D, 0);
        actor.root.visible = true;
        // 位置是瞬移过来的：头几帧的速度估计会把人带进跑步片，多跑几秒回到站立待机。
        for (let i = 0; i < 240; i++) actor.Update(1 / 60, { elapsed: 1.2 + i / 60 });
      }
      let result = pose;
      if (focus) {
        // 对着头骨拍：相机放在人正前方 dist 米（再往人右手边偏 side 米），平视头部。
        const actor = window.__surfaceActors[focus.id];
        actor.root.updateMatrixWorld(true);
        const head = actor.characterRig.bones.head.getWorldPosition(new T.camera.position.constructor());
        head.y += focus.lift || 0;
        const a = actor.root.rotation.y, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
        const cx = head.x + fx * focus.dist + rx * focus.side, cz = head.z + fz * focus.dist + rz * focus.side;
        const cy = head.y + (focus.rise || 0);
        const yawL = Math.atan2(-(head.x - cx), -(head.z - cz));
        const pitchL = Math.atan2(head.y - cy, Math.hypot(head.x - cx, head.z - cz));
        result = ed.ApplyPose({ id: "surface", x: cx, z: cz, y: cy, h: null, yaw: yawL, pitch: pitchL, fov: focus.fov, phase: null, far: null });
      }
      ed.host.SetViewmodelVisible?.(viewmodel);
      document.getElementById("edRoot")?.classList.add("off");
      return result;
    }, { camera, actors, viewmodel, focus });
    await page.evaluate((viewmodel) => { const T = window.Tengxian; T.editor.active.host.SetViewmodelVisible?.(viewmodel); T.StepFrames(24); }, viewmodel);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    log.shots.push({ name, pose: res && { x: +res.x.toFixed(2), y: +res.y.toFixed(2), z: +res.z.toFixed(2) } });
    console.log("shot", name);
  };

  const D = Math.PI / 180, yaw = SITE.yawDeg * D;
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const At = (along, side) => ({ x: SITE.x + fwd.x * along + right.x * side, z: SITE.z + fwd.z * along + right.z * side });
  // 人面朝镜头：局部 -Z 指向相机（人物正面契约）。
  const faceCam = SITE.yawDeg + 180;
  const cam = (h, pitchDeg, fov = 40) => ({ x: SITE.x, z: SITE.z, h, yawDeg: SITE.yawDeg, pitchDeg, fov });

  await Shoot("Lineup", { camera: cam(1.35, -4, 34), actors: LINEUP.map((e, i) => ({ id: e.id, ...At(6.2, (i - 2.5) * 0.95), yawDeg: faceCam })) });
  for (const id of FACES) await Shoot(`Face_${id}`, { camera: cam(1.62, -3, 30), actors: [{ id, ...At(1.05, 0), yawDeg: faceCam + 12 }],
    focus: { id, dist: 0.95, side: -0.25, lift: 0.02, rise: 0.02, fov: 30 } });
  for (const id of LEGS) await Shoot(`Legs_${id}`, { camera: cam(0.95, -24, 40), actors: [{ id, ...At(1.55, 0), yawDeg: faceCam + 20 }] });
  log.errors = errors;
  if (errors.length) console.log("page errors", errors.slice(0, 5));
  await page.close();
} finally {
  fs.writeFileSync(path.join(out, "shots_log.json"), JSON.stringify(log, null, 1));
  await browser.close(); await new Promise((r) => server.close(r));
  console.log("->", out);
}
