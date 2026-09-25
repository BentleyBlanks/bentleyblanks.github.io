// Script_FrontStoryboardShots.mjs — 03 两张分镜（SB07 / SB08）的真实驾驶抓帧与画面判据。
//
// 口径：docs/Data_FirstLevelStoryboard0103Contract.md §5 的 SB07、SB08 两行（本轮 Front 包，§3）。
// 由调研工具 REL/附件/survey/tools/B_StoryboardGrab.mjs --mode=front 整理而来（2026-09-25）。
//
//   node Taierzhuang1938/Script_FrontStoryboardShots.mjs                       抓 SB07/SB08、判、写 json，判据没过退出码 1
//   node …  --side-by-side=<分镜目录>                                           另拼「分镜 | 实机」并排图（找 Storyboard_07*/08* 的 png；分镜不进仓库）
//   node …  --quality=low|high（默认 high）  --out=<目录>（默认 _shots/FrontStoryboardShots）  --hud（保留 HUD）
//   node …  --strict                                                            连「等 Set 布景」的判据也算（第二波合并后用）
//
// 怎么抓（与整关驾驶同一套输入，CampaignKit.Route：真走、真打、躲手榴弹）：
//   · missionStage=3 冷启动（不是调试跳转），沿 MISSION_ROUTES.support 走，直到 FrontApproach
//     「贴这道墙！前头有人！」那句真的开播（事实 frontApproachPointed，罗此刻开始伸臂指路，指 leaderLead.pointS 秒）。
//     玩家站起来，视线取契约 §5 的默认范围 yaw −66°…−50° 里让罗落在画面横向约 0.75 的那一个，俯仰 −2°。 → SB07
//   · 接着把支援路线走完、夺点（同整关驾驶，被手榴弹甩到西矮墙外就从西门绕回），
//     蹲在座位上还击到第一批放行，再走到阵位机枪北侧 (25.6,−155.2) 站定，视线 yaw 99°、俯仰 −3°，每 0.1 s 看一次
//     正在过缺口的第一批，第一次看到 ≥ 3 人（或 100 s 里最多的那一刻）截图。 → SB08
//
// 「看得见」怎么判（不是只算投影落在画框里 —— 投影在框里的人可能被沟壁、矮墙、自己的枪挡住）：
//   同一机位再画一张「涂色图」：场景里所有不透明网格涂黑、要判的人（和机枪）各涂一种颜色，
//   雾、天空、粒子、半透明件不画，读回像素数、包围框、重心（换算到 1280×720）。
//   已知近似：远景层（46 m 外的人）是实例化的，涂色图里只按黑色挡人；被判的人都在 46 m 内（走完整模型）。
//
// 判据分两类：owner "front"（本包：人站位、动作、人数、机位）默认就判；owner "set"（布景/烟/飞机/破墙）
// 默认只出图人工看、json 里标 pending，--strict 才算进退出码。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { InstallInputDriver, CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_GUARD_MG_GROUP as MG } from "./Data_FirstLevelMissionFront.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const Arg = (k, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : (process.argv.includes(`--${k}`) ? true : d); };
const QUALITY = String(Arg("quality", "high"));
const OUT = path.resolve(String(Arg("out", path.join(here, "_shots", "FrontStoryboardShots"))));
const SBS = Arg("side-by-side") ? path.resolve(String(Arg("side-by-side"))) : null;
const KEEP_HUD = !!Arg("hud"), STRICT = !!Arg("strict");
const W = 1280, H = 720;

/** 契约 §5 的镜头起点与画面判据（归一化画面坐标 x 左→右、y 上→下；允许按画面调人 ±0.6 m、镜头 ±8°，§1.4）。 */
const FRONT_STORYBOARD_SHOTS = Object.freeze({
  SB07: Object.freeze({
    // 玩家约 (5.0,−143.0)：FrontApproach 在 approach[9]=(7,−143.5) 周围 2.5 m 触发，站位允许 2 m。
    player: Object.freeze({ x: 5.0, z: -143.0, toleranceM: 2.0 }),
    yawRangeDeg: Object.freeze([-66, -50]), pitchDeg: -2, luoTargetX: 0.75,
    luo: Object.freeze({ xMin: 0.55, xMax: 0.95, yMin: 0.25, yMax: 0.85, distMin: 3.5, distMax: 5.5, clip: "PointBlockade", minPx: 1500, armStraight: 0.9, facingDeg: 35, awayMaxDeg: 100 }),
    // 背坡机枪组：两人都要在画面左侧（重心 x < 0.4）、各自至少露出 minPx 像素（1280×720 计）。
    mgGroup: Object.freeze({ xMax: 0.4, minPx: 25 }),
  }),
  SB08: Object.freeze({
    player: Object.freeze({ x: 25.6, z: -155.2, toleranceM: 0.6 }),
    yawDeg: 99, pitchDeg: -3,
    // minPx 60（1280×720 计）：34 m 外一个人全身约 35×10 px，60 px 大约是头肩露出沟沿；只露一个头顶（≈20 px）不算。
    firstBatch: Object.freeze({ minVisible: 3, minPx: 60 }),
    // 左前景的机枪（夺下的 MissionGun）：重心在画面左 0.4 以内、面积够大（前景）。
    gun: Object.freeze({ xMax: 0.4, minPx: 3000 }),
    // 放行之后站到机位上，每 0.1 s 看一次（缺口段沟只有 0.5 m 深、约 6 m 长，人过这一段只要两三秒）。
    waitS: 100, crossingSampleS: 0.1,
  }),
});

fs.mkdirSync(OUT, { recursive: true });
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=3&quality=${QUALITY}&scale=small`;
const report = { url, quality: QUALITY, strict: STRICT, started: new Date().toISOString(), shots: {}, checks: [], errors };
const Save = () => fs.writeFileSync(path.join(OUT, "Data_FrontStoryboardShots.json"), JSON.stringify(report, null, 1));
console.log("URL", url, "OUT", OUT);

/** 页面里的抓帧工具：描述当帧（镜头、人物屏幕位置与距离）和涂色图。 */
async function InstallGrab() {
  await page.evaluate(async ({ W, H }) => {
    const g = window.Tengxian, T = await import("three");
    const G = window.frontShots = { T };
    const cache = { black: new Map(), rt: null };
    G.Cam = () => {
      const cam = g.player.camera; cam.updateMatrixWorld(true);
      const dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      return { yawDeg: +(Math.atan2(-dir.x, -dir.z) * 180 / Math.PI).toFixed(2), pitchDeg: +(Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI).toFixed(2),
        pos: cam.position.toArray().map((v) => +v.toFixed(3)), fov: +cam.fov.toFixed(2),
        eyeAboveGround: +(cam.position.y - g.battlefield.GroundHeight(cam.position.x, cam.position.z)).toFixed(3) };
    };
    G.Screen = (v) => {
      const cam = g.player.camera; cam.updateMatrixWorld(true);
      const dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), p = v.clone().project(cam), behind = v.clone().sub(cam.position).dot(dir) < 0;
      return { x: +((p.x + 1) / 2).toFixed(3), y: +((1 - p.y) / 2).toFixed(3), inFrame: !behind && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 };
    };
    G.Head = (a) => a?.actor?.characterRig?.bones?.head?.getWorldPosition(new T.Vector3()) || new T.Vector3(a.position.x, a.position.y + 1.4, a.position.z);
    G.Actor = (a, role) => {
      const cam = g.player.camera.position;
      return { role, id: a.id, missionId: a.missionId || null, alive: a.alive, lod: a.renderLod || null, stance: a.stance ?? null,
        pos: [+a.position.x.toFixed(2), +a.position.z.toFixed(2)], distM: +Math.hypot(a.position.x - cam.x, a.position.z - cam.z).toFixed(2),
        head: G.Screen(G.Head(a)), clip: a.openingStoryboardPose?.clip || null, upperBody: !!a.openingStoryboardPose?.upperBody,
        pointing: !!a.frontPointing, fired: a.fireSequence || 0, aim: +(a.aimBlend ?? 0).toFixed(2),
        // 真画出来的那一层（旗子立着不算：大脑一据枪，开场层就把上半身 clip 扔掉 —— 09-25 第一趟就是这么红的）。
        shown: (() => { const st = a.actor?.characterRig?.openingStoryboardState; return st ? { clip: st.clipId, blend: +(st.blend ?? 1).toFixed(2) } : null; })(),
        arm: G.Arm(a) };
    };
    // 伸臂量：每条胳膊 |肩→手| / (上臂 + 前臂)，取最直的那条；1 = 完全伸直。
    G.Arm = (a) => {
      const root = a.actor?.root; if (!root) return null;
      const P = (o) => o.getWorldPosition(new T.Vector3()), hands = [];
      root.traverse((o) => { if (o.isBone && /Hand/i.test(o.name) && !/Finger|Index|Thumb|Middle|Ring|Pinky|Twist/i.test(o.name)) hands.push(o); });
      let best = null;
      for (const hand of hands) {
        let fore = hand.parent; while (fore && !/Forearm|LowerArm/i.test(fore.name)) fore = fore.parent;
        let upper = fore?.parent; while (upper && !/UpperArm/i.test(upper.name)) upper = upper.parent;
        if (!fore || !upper) continue;
        const h = P(hand), f = P(fore), u = P(upper), len = u.distanceTo(f) + f.distanceTo(h);
        const v = { hand: hand.name, straight: +(u.distanceTo(h) / len).toFixed(3), handAboveShoulderM: +(h.y - u.y).toFixed(2) };
        if (!best || v.straight > best.straight) best = v;
      }
      return best;
    };
    // 涂色图：targets = [{key, roots:[Object3D]}]，返回每个 key 的像素数（按 W×H 计）、包围框、重心（归一化）。
    G.Paint = (targets, scale = 0.5) => {
      const renderer = g.renderer, scene = g.scene, cam = g.player.camera;
      const w = Math.round(W * scale), h = Math.round(H * scale);
      if (!cache.rt || cache.rt.width !== w) cache.rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
      g.ai.CullActors(cam); scene.updateMatrixWorld(true);
      const owner = new Map(), mats = targets.map((t, i) => new T.MeshBasicMaterial({ color: new T.Color().setRGB((20 * (i + 1)) / 255, 1, 0, T.LinearSRGBColorSpace), side: T.DoubleSide, fog: false }));
      targets.forEach((t, i) => { for (const r of t.roots) r?.traverse((o) => owner.set(o, i)); });
      const Black = (src) => {
        const side = src?.side ?? T.FrontSide, cut = src?.alphaTest > 0 && src?.map ? src : null, key = cut ? src.uuid : "side" + side;
        let m = cache.black.get(key);
        if (!m) { m = new T.MeshBasicMaterial({ color: 0x000000, side, fog: false }); if (cut) { m.map = cut.map; m.alphaTest = cut.alphaTest; } cache.black.set(key, m); }
        return m;
      };
      const swapped = [], hidden = [];
      scene.traverse((o) => {
        if (!o.visible) return;
        if (o.isPoints || o.isLine || o.isSprite) { o.visible = false; hidden.push(o); return; }
        if (!o.isMesh) return;
        const i = owner.get(o), src = Array.isArray(o.material) ? o.material[0] : o.material;
        if (i == null && src && ((src.transparent && ((src.opacity ?? 1) < 0.95 || src.depthWrite === false)) || src.colorWrite === false || src.visible === false)) { o.visible = false; hidden.push(o); return; }
        swapped.push([o, o.material]); o.material = i != null ? mats[i] : Black(src);
      });
      const keep = { fog: scene.fog, bg: scene.background, auto: renderer.shadowMap.autoUpdate, clear: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha(), target: renderer.getRenderTarget() };
      scene.fog = null; scene.background = new T.Color(0, 0, 0); renderer.shadowMap.autoUpdate = false;
      const pixels = new Uint8Array(w * h * 4);
      try {
        renderer.setRenderTarget(cache.rt); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, true);
        renderer.render(scene, cam); renderer.readRenderTargetPixels(cache.rt, 0, 0, w, h, pixels);
      } finally {
        for (const [o, m] of swapped) o.material = m;
        for (const o of hidden) o.visible = true;
        scene.fog = keep.fog; scene.background = keep.bg; renderer.shadowMap.autoUpdate = keep.auto;
        renderer.setClearColor(keep.clear, keep.alpha); renderer.setRenderTarget(keep.target);
        for (const m of mats) m.dispose();
      }
      const out = targets.map((t) => ({ key: t.key, px: 0, sx: 0, sy: 0, x0: 1, y0: 1, x1: 0, y1: 0 }));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (pixels[k + 1] < 200 || pixels[k + 2] > 40) continue;
        const o = out[Math.round(pixels[k] / 20) - 1]; if (!o) continue;
        const nx = x / w, ny = 1 - y / h; // readPixels 从下往上
        o.px++; o.sx += nx; o.sy += ny; o.x0 = Math.min(o.x0, nx); o.x1 = Math.max(o.x1, nx); o.y0 = Math.min(o.y0, ny); o.y1 = Math.max(o.y1, ny);
      }
      const k2 = (W * H) / (w * h);
      return Object.fromEntries(out.map((o) => [o.key, o.px ? { px: Math.round(o.px * k2), cx: +(o.sx / o.px).toFixed(3), cy: +(o.sy / o.px).toFixed(3),
        box: [+o.x0.toFixed(3), +o.y0.toFixed(3), +o.x1.toFixed(3), +o.y1.toFixed(3)] } : { px: 0 }]));
    };
    // 摆视线：站姿、yaw/pitch（度），推几帧让枪与手跟上，最后几帧渲染（截图就是最后一帧）。
    G.Look = (yawDeg, pitchDeg, stance = "stand", frames = 8) => {
      const p = g.player;
      g.Debug.Key("KeyW", false); g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      if (p.stance !== stance) g.Debug.Key(stance === "crouch" ? "KeyC" : p.stance === "crouch" ? "KeyC" : "KeyZ");
      // 刚开过镜（驾驶器还击时按右键）视场还在往回收：等它停稳再拍（09-25 第六趟 SB08 拍在 48° 上，比默认窄 7°）。
      let settle = 0;
      for (let i = 0, last = NaN; i < 90; i++) {
        p.yaw = yawDeg * Math.PI / 180; p.pitch = pitchDeg * Math.PI / 180; p.aimYaw = 0; g.StepFrames(1, 1 / 60, false);
        const fov = p.camera.fov; if (Math.abs(fov - last) < 0.01 && ++settle >= 2) break; last = fov;
      }
      for (let i = 0; i < frames; i++) { p.yaw = yawDeg * Math.PI / 180; p.pitch = pitchDeg * Math.PI / 180; p.aimYaw = 0; g.StepFrames(1, 1 / 60, i >= frames - 3); }
      return { stance: p.stance };
    };
  }, { W, H });
}

const checks = report.checks;
function Check(shot, name, owner, ok, detail) {
  checks.push({ shot, name, owner, ok: !!ok, detail });
  console.log(ok ? "  ✓" : owner === "set" && !STRICT ? "  ·" : "  ✗", shot, name, `[${owner}]`, JSON.stringify(detail));
}

async function ShootSB07(Route) {
  const C = FRONT_STORYBOARD_SHOTS.SB07;
  await Route(MISSION_ROUTES.support.slice(1), "SB07_Approach", { stance: "crouch", fight: true, crawl: true, recoverAfterEvade: true, stopFact: "frontApproachPointed" });
  // 视线：契约默认范围内让罗落在画面横向 luoTargetX 的那个 yaw。
  const info = await page.evaluate(({ C, MG, pointS }) => {
    const g = window.Tengxian, G = window.frontShots, r = g.Debug.FirstLevelMissionRuntime(), fb = r.frontBattle, luo = fb.Leader;
    fb.PointAge = () => r.time - (fb.approachPointAt ?? r.time);
    const e = g.player.EyePosition, bearing = Math.atan2(e.x - luo.position.x, e.z - luo.position.z) * 180 / Math.PI;
    const halfH = Math.atan(Math.tan(g.player.camera.fov * Math.PI / 360) * g.player.camera.aspect);
    const offset = Math.atan((C.luoTargetX * 2 - 1) * Math.tan(halfH)) * 180 / Math.PI;
    const yaw = Math.max(C.yawRangeDeg[0], Math.min(C.yawRangeDeg[1], bearing + offset));
    G.Look(yaw, C.pitchDeg, "stand");
    // 起手那 0.3 s 是从上一个姿势混过去的（C.poseBlendS），而他等人时是面朝玩家的（LeaderGuide.Watch），
    // 指路要先转回前方（原地转身 3.4 rad/s，掉头约 0.9 s）：等姿势混满、身子转到指的方向 facingDeg 以内再拍，
    // 最多等到 pointS 前 0.3 s。09-25 第二趟 0.38 s 就拍了：人跪着面朝镜头、胳膊指向画面左边。
    const Wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
    for (let i = 0; i < Math.round((pointS - fb.PointAge() - 0.3) * 60); i++) {
      const st = luo.actor?.characterRig?.openingStoryboardState;
      if (st?.clipId === C.luo.clip && (st.blend ?? 1) >= 0.97 && Number.isFinite(luo.watchYaw) && Math.abs(Wrap(luo.yaw - luo.watchYaw)) * 180 / Math.PI <= C.luo.facingDeg) break;
      G.Look(yaw, C.pitchDeg, "stand", 1);
    }
    G.Look(yaw, C.pitchDeg, "stand", 3);
    const mg = (r.guards || []).filter((x) => x.mg);
    const paint = G.Paint([{ key: "luo", roots: [luo.actor?.root] }, ...mg.map((x) => ({ key: x.mg.role, roots: [x.actor.actor?.root] }))]);
    const nestGunner = g.ai.soldiers.find((s) => s.missionId === "RightNestGunner");
    const wounded = G.Screen(new G.T.Vector3(MG.wounded.x, g.battlefield.GroundHeight(MG.wounded.x, MG.wounded.z) + 0.3, MG.wounded.z));
    return { time: +r.time.toFixed(2), sincePointS: +(r.time - (fb.approachPointAt ?? r.time)).toFixed(2), fact: r.flow.facts.get?.("frontApproachPointed") ?? null,
      bearingLuoDeg: +bearing.toFixed(1), camera: G.Cam(), player: { pos: g.player.position.toArray().map((v) => +v.toFixed(2)), stance: g.player.stance, alive: g.player.alive },
      luo: { ...G.Actor(luo, "luo"), yawDeg: +(luo.yaw * 180 / Math.PI).toFixed(1), pointYawDeg: Number.isFinite(luo.watchYaw) ? +(luo.watchYaw * 180 / Math.PI).toFixed(1) : null,
        // 他背对/侧对镜头吗：身体朝向与「镜头→罗」方向之差（0 = 正背对镜头，180 = 正对镜头）。
        awayFromCameraDeg: +(Math.abs(Math.atan2(Math.sin(luo.yaw - Math.atan2(g.player.camera.position.x - luo.position.x, g.player.camera.position.z - luo.position.z)), Math.cos(luo.yaw - Math.atan2(g.player.camera.position.x - luo.position.x, g.player.camera.position.z - luo.position.z)))) * 180 / Math.PI).toFixed(1) }, mg: mg.map((x) => G.Actor(x.actor, x.mg.role)), nestGunner: nestGunner ? G.Actor(nestGunner, "RightNestGunner") : null,
      wounded, paint, state: fb.State() };
  }, { C, MG, pointS: B.leaderLead.pointS });
  await page.screenshot({ path: path.join(OUT, "SB07.png") });
  fs.writeFileSync(path.join(OUT, "SB07.json"), JSON.stringify(info, null, 1));
  report.shots.SB07 = info;
  const p = info.player.pos, dp = Math.hypot(p[0] - C.player.x, p[2] - C.player.z), L = info.luo, Lp = info.paint.luo;
  Check("SB07", "玩家站在右侧低沟「贴这道墙」处、站姿", "front", dp <= C.player.toleranceM && info.player.stance === "stand", { dp: +dp.toFixed(2), stance: info.player.stance });
  Check("SB07", "视线在契约默认范围 yaw −66°…−50°", "front", info.camera.yawDeg >= C.yawRangeDeg[0] - 0.5 && info.camera.yawDeg <= C.yawRangeDeg[1] + 0.5, { yaw: info.camera.yawDeg, pitch: info.camera.pitchDeg });
  Check("SB07", "罗在右中", "front", Lp.px > 0 && Lp.cx >= C.luo.xMin && Lp.cx <= C.luo.xMax && Lp.cy >= C.luo.yMin && Lp.cy <= C.luo.yMax, { cx: Lp.cx, cy: Lp.cy, head: L.head });
  Check("SB07", "罗离玩家 3.5–5.5 m", "front", L.distM >= C.luo.distMin && L.distM <= C.luo.distMax, { distM: L.distM });
  Check("SB07", "罗在伸臂指路（PointBlockade 上半身真画出来了）", "front", L.clip === C.luo.clip && L.upperBody && L.pointing && info.sincePointS <= B.leaderLead.pointS
    && L.shown?.clip === C.luo.clip && L.shown.blend >= 0.9 && (L.arm?.straight ?? 0) >= C.luo.armStraight, { clip: L.clip, shown: L.shown, arm: L.arm, aim: L.aim, sincePointS: info.sincePointS });
  Check("SB07", "罗面朝指的方向、背/侧对镜头（不是回头招呼玩家）", "front", L.pointYawDeg != null && Math.abs(((L.yawDeg - L.pointYawDeg + 540) % 360) - 180) <= C.luo.facingDeg && L.awayFromCameraDeg <= C.luo.awayMaxDeg,
    { yawDeg: L.yawDeg, pointYawDeg: L.pointYawDeg, awayFromCameraDeg: L.awayFromCameraDeg });
  Check("SB07", "罗看得见（没被沟壁挡住）", "front", Lp.px >= C.luo.minPx, { px: Lp.px });
  for (const m of info.mg) {
    const q = info.paint[m.role];
    Check("SB07", `背坡机枪组 ${m.role} 在画面左侧且看得见`, "front", q.px >= C.mgGroup.minPx && q.cx <= C.mgGroup.xMax, { px: q.px, cx: q.cx, cy: q.cy, distM: m.distM, stance: m.stance });
  }
  Check("SB07", "背坡伤员（尸体层）在画面左侧", "front", info.wounded.inFrame && info.wounded.x <= C.mgGroup.xMax, info.wounded);
  Check("SB07", "阵位机枪手在画面右侧（残破砖墙、口焰待 Set）", "front", !!info.nestGunner?.head.inFrame && info.nestGunner.head.x >= 0.5, info.nestGunner?.head ?? null);
  for (const what of ["右侧残破砖墙、机枪从破口开火", "中远拒马与大黑烟柱", "天上两架日机横飞"]) Check("SB07", what, "set", false, "pending: 第二波 Set 布景合入后看图");
}

/** 原地还击直到页面条件成立（最多 seconds 秒）；被打死走一次检查点重来。 */
async function HoldUntil(cond, seconds) {
  let retried = false;
  for (let k = 0; k < seconds / 5; k++) {
    const st = await page.evaluate((cond) => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), Done = new Function("r", "g", "return (" + cond + ")");
      for (let f = 0; f < 300 && g.player.alive; f++) {
        if (Done(r, g)) return { hit: true };
        const ev = window.MissionInputDriver.EvadeGrenade(), foe = ev ? null : window.MissionInputDriver.Target(90);
        if (foe) window.MissionInputDriver.Shoot(foe); else if (!ev) { g.Debug.Mouse(0, false); g.Debug.Mouse(2, false); if (g.state.ammo === 0) g.Debug.Key("KeyR"); }
        if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, f % 6 === 5);
      }
      g.Debug.Mouse(0, false);
      return { hit: false, alive: g.player.alive, t: r.time, stage: r.flow.stage.id, player: g.player.position.toArray().map((v) => +v.toFixed(1)) };
    }, cond);
    if (st.hit) return st;
    if (!st.alive) {
      if (retried) return st;
      retried = true; report.holdRetries = (report.holdRetries || 0) + 1;
      await page.evaluate(() => { const g = window.Tengxian; g.Debug.MenuAct("continueCheckpoint"); g.StepFrames(1, 1 / 60, false); });
    }
  }
  return { hit: false };
}

async function ShootSB08(Route) {
  const C = FRONT_STORYBOARD_SHOTS.SB08;
  // 走完支援路线、夺点（与整关驾驶 DriveLegs 同一条：躲雷甩到西矮墙外就从西门绕回）。
  await Route(MISSION_ROUTES.support, "SB08_RightNestApproach", { stance: "crouch", fight: true, crawl: true, recoverAfterEvade: true, rejoinRoute: MISSION_ROUTES.support }).catch(async (error) => {
    if (!/actual body reached route end/.test(error?.message || "")) throw error;
    console.log("SB08_RightNestApproach: stalled after an evade, going round through the west door");
    await Route(S.approach.slice(-3), "SB08_RightNestApproachViaDoor", { stance: "crouch", fight: true, crawl: true, recoverAfterEvade: true });
  });
  const captured = await HoldUntil("r.Has('rightNestCaptured')", 90);
  if (!captured.hit) throw Error("rightNestCaptured 90 s 内没发生：" + JSON.stringify(captured));
  // 从哪儿走回机位：西矮墙外的从西门绕，东墙外的从北头绕（同整关驾驶 ReturnToSeat；09-25 第十二趟直线走顶在西矮墙上）。
  const ToViewpoint = async () => {
    const at = await page.evaluate(() => { const p = window.Tengxian.player.position; return { x: p.x, z: p.z }; }), vp = { x: C.player.x, z: C.player.z };
    const west = at.x < 24.4 && at.z < Space.westDoor.z + 0.7, east = at.x > 32.5 && at.z > -145.2;
    const points = east ? [{ x: at.x, z: -141.8 }, { x: 30, z: -141.8 }, vp] : west ? [{ x: at.x, z: Space.westDoor.z }, Space.westDoor, vp] : [vp];
    await Route(points, "SB08_NorthOfGun", { stance: "crouch", fight: true, arrivalM: 0.35, recoverAfterEvade: true });
  };
  // 先蹲着走到机位、蹲着还击等第一批放行（09-25 第九趟站在那儿干等了一百来秒，被打死在 (25.6,−152.4)；
  // 第十一趟放行后才从座位走过去，到位时一列人已经过了缺口），有人开始过口再站起来看。
  await ToViewpoint();
  const released = await HoldUntil(`(r.guards||[]).slice(0,${B.firstBatch}).some((x)=>x.crossing)`, 150);
  if (!released.hit) throw Error("第一批 150 s 内没放行：" + JSON.stringify(released));
  if (await page.evaluate((vp) => Math.hypot(window.Tengxian.player.position.x - vp.x, window.Tengxian.player.position.z - vp.z) > 0.8, C.player)) await ToViewpoint();
  let best = null;
  const samples = [];
  for (let k = 0, t0 = null; k < 1000; k++) {
    const s = await page.evaluate(({ C, n }) => {
      const g = window.Tengxian, G = window.frontShots, r = g.Debug.FirstLevelMissionRuntime();
      // 站定看着缺口（分镜里玩家就是在看这一列人）：只躲手榴弹、扎绷带，不还击 ——
      // 还击会开镜、转头，视场收放一次要一秒多，采样就稀成每 1.8 s 一张（09-25 第十趟），过口那几秒全漏掉。
      // 第一次（或躲完雷）先 G.Look 站起来、等视场停稳；之后每 crossingSampleS 看一眼，帧帧都渲染（时间滤波不断档）。
      if (!G.watching) { G.Look(C.yawDeg, C.pitchDeg, "stand"); G.watching = true; }
      else for (let f = 0, frames = Math.round(C.crossingSampleS * 60); f < frames && g.player.alive; f++) {
        const ev = window.MissionInputDriver.EvadeGrenade();
        if (ev) G.watching = false;
        else { g.player.yaw = C.yawDeg * Math.PI / 180; g.player.pitch = C.pitchDeg * Math.PI / 180; g.player.aimYaw = 0; }
        if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
        g.StepFrames(1, 1 / 60, true);
      }
      const p = g.player.position, first = (r.guards || []).slice(0, n), gun = g.scene.getObjectByName("Emplacement_MissionGun");
      const paint = G.Paint([{ key: "gun", roots: [gun] }, ...first.map((x, i) => ({ key: "g" + i, roots: [x.actor.actor?.root] }))], 1);
      // 只数正在过口的人（crossing 且还没进安全区）：还跪在最后遮挡处等的不是分镜里那一列（09-25 第五趟就数成了 3 个等着的）。
      const visible = first.filter((x, i) => x.actor.alive && x.crossing && !x.safe && paint["g" + i].px >= C.firstBatch.minPx).length;
      return { t: +r.time.toFixed(2), stage: r.flow.stage.id, alive: g.player.alive, visible,
        first: first.map((x, i) => ({ ...G.Actor(x.actor, "g" + i), progress: x.progress, crossing: !!x.crossing, safe: !!x.safe, paint: paint["g" + i] })),
        gun: paint.gun, camera: G.Cam(), player: { pos: p.toArray().map((v) => +v.toFixed(2)), stance: g.player.stance }, state: r.frontBattle.State() };
    }, { C, n: B.firstBatch });
    t0 ??= s.t; if (s.t - t0 > C.waitS) break;
    samples.push({ t: s.t, visible: s.visible, pos: s.player.pos, crossing: s.first.filter((x) => x.crossing && !x.safe).length, safe: s.first.filter((x) => x.safe).length,
      px: s.first.map((x) => x.paint.px) });
    if (!s.alive) {
      // 抓帧不是生存测试：走游戏自带的检查点重来一次，回到机位接着看（次数记 holdRetries）。
      if ((report.holdRetries || 0) >= 1) throw Error("SB08：玩家在阵位上等的时候死了两次 " + JSON.stringify(s.player.pos));
      report.holdRetries = (report.holdRetries || 0) + 1;
      await page.evaluate(() => { const g = window.Tengxian; g.Debug.MenuAct("continueCheckpoint"); g.StepFrames(1, 1 / 60, false); });
      await ToViewpoint(); await page.evaluate(() => { window.frontShots.watching = false; }); continue;
    }
    if (!best || s.visible > best.visible) { best = s; await page.screenshot({ path: path.join(OUT, "SB08.png") }); }
    // 躲雷把人带离了机位：走回去再看。
    if (Math.hypot(s.player.pos[0] - C.player.x, s.player.pos[2] - C.player.z) > 0.8) {
      await ToViewpoint(); await page.evaluate(() => { window.frontShots.watching = false; });
    }
    if (s.visible >= C.firstBatch.minVisible) break;
    if (s.first.every((x) => x.safe || !x.alive)) break;
  }
  best.samples = samples;
  fs.writeFileSync(path.join(OUT, "SB08.json"), JSON.stringify(best, null, 1));
  report.shots.SB08 = best;
  const dp = Math.hypot(best.player.pos[0] - C.player.x, best.player.pos[2] - C.player.z);
  Check("SB08", "玩家在阵位机枪北侧、站姿", "front", dp <= C.player.toleranceM && best.player.stance === "stand", { dp: +dp.toFixed(2), stance: best.player.stance });
  Check("SB08", "视线朝缺口 yaw 99°、俯仰 −3°", "front", Math.abs(best.camera.yawDeg - C.yawDeg) <= 8 && Math.abs(best.camera.pitchDeg - C.pitchDeg) <= 5, { yaw: best.camera.yawDeg, pitch: best.camera.pitchDeg });
  Check("SB08", `同一帧看得见正在过缺口的第一批 ≥ ${C.firstBatch.minVisible} 人`, "front", best.visible >= C.firstBatch.minVisible,
    { visible: best.visible, t: best.t,
      // 算进去的人在画面上横向铺开多宽（px）：34 m 外一列人几乎是一团，数得出 3 个不等于看得出 3 个，这个数只报不判。
      spreadPx: (() => { const xs = best.first.filter((x) => x.crossing && !x.safe && x.paint.px >= C.firstBatch.minPx).map((x) => x.paint.cx); return xs.length ? Math.round((Math.max(...xs) - Math.min(...xs)) * W) : 0; })(),
      people: best.first.map((x) => ({ id: x.id, px: x.paint.px, cx: x.paint.cx, distM: x.distM, progress: x.progress, crossing: x.crossing, safe: x.safe })) });
  Check("SB08", "机枪在左前景", "front", best.gun.px >= C.gun.minPx && best.gun.cx <= C.gun.xMax, best.gun);
  for (const what of ["机枪旁弹药箱", "缺口东沿倒塌砖墙延伸向远处", "缺口段沙袋木板护壁", "远处火点与烟柱"]) Check("SB08", what, "set", false, "pending: 第二波 Set 布景合入后看图");
}

/** 「分镜 | 实机」并排图：在浏览器里用 canvas 拼，实机那半标出判据用到的包围框。 */
async function SideBySide(label, boardFile, boxes) {
  const board = fs.readFileSync(boardFile).toString("base64"), shot = fs.readFileSync(path.join(OUT, `${label}.png`)).toString("base64");
  const png = await page.evaluate(async ({ board, shot, label, boxes, W, H }) => {
    const Load = (b) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = "data:image/png;base64," + b; });
    const [a, b] = await Promise.all([Load(board), Load(shot)]);
    const aw = Math.round(a.width * H / a.height), top = 30, c = document.createElement("canvas");
    c.width = aw + 12 + W; c.height = H + top; const x = c.getContext("2d");
    x.fillStyle = "#111"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(a, 0, top, aw, H); x.drawImage(b, aw + 12, top, W, H);
    x.font = "18px sans-serif"; x.fillStyle = "#eee"; x.fillText(`${label}  分镜 | 实机`, 8, 21);
    x.strokeStyle = "rgba(255,80,80,.55)"; x.lineWidth = 1;
    for (const ox of [0, aw + 12]) {
      const ww = ox ? W : aw;
      for (const f of [1 / 3, 2 / 3]) { x.beginPath(); x.moveTo(ox + ww * f, top); x.lineTo(ox + ww * f, top + H); x.stroke(); x.beginPath(); x.moveTo(ox, top + H * f); x.lineTo(ox + ww, top + H * f); x.stroke(); }
    }
    x.lineWidth = 2; x.font = "14px sans-serif";
    // 小目标（远处的人）的字排到画面下方的图例里，框上只标序号，免得挤成一团。
    let legend = 0;
    boxes.forEach((bx, n) => {
      if (!bx.box) return;
      const [x0, y0, x1, y1] = bx.box, X = aw + 12 + x0 * W, Y = top + y0 * H, small = (x1 - x0) * W < 60;
      x.strokeStyle = bx.color; x.strokeRect(X - 2, Y - 2, (x1 - x0) * W + 4, (y1 - y0) * H + 4);
      x.fillStyle = bx.color;
      if (!small) { x.fillText(bx.text, X, Math.max(top + 14, Y - 5)); return; }
      x.fillText(String(n), X, Y - 5 - (n % 2) * 14);
      x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(aw + 18, top + H - 24 - legend * 20, 360, 19);
      x.fillStyle = bx.color; x.fillText(n + "  " + bx.text, aw + 22, top + H - 10 - legend * 20); legend++;
    });
    return c.toDataURL("image/png").split(",")[1];
  }, { board, shot, label, boxes, W, H });
  const file = path.join(OUT, `SideBySide_${label}.png`);
  fs.writeFileSync(file, Buffer.from(png, "base64"));
  console.log("SIDE_BY_SIDE", file);
  return file;
}

let failure = null;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMissionRuntime()?.frontShow?.bunker?.ready, null, { timeout: 120000 });
  if (!KEEP_HUD) await page.addStyleTag({ content: "#hud{display:none!important}" });
  await InstallGrab();
  // 这是抓帧不是生存测试：驾驶里被打死（09-25 第四趟：躲雷甩到阵位东墙外、白刃里死了）就走游戏自带的检查点重来，
  // 事实与伤亡都保留（CampaignKit 断言），次数记进 json 的 retries。连续一条命的整关门禁是 FirstLevelFrontBattleBrowserTest。
  const ctx = { page, browser, server, output: OUT, errors, options: { audioCheck: false, allowCheckpointRetry: true }, stageJumps: false, stageFrom: 3, stageTo: 3,
    jumpReceipts: [], campaignRetries: [], capturedActivities: new Set() };
  await InstallInputDriver(ctx);
  const { Route } = CampaignActions(ctx);
  await ShootSB07(Route); Save();
  report.retries = ctx.campaignRetries;
  await ShootSB08(Route); Save();
  if (SBS) {
    const Find = (n) => fs.readdirSync(SBS).find((f) => new RegExp(`^Storyboard_0?${n}_.*\\.png$`, "i").test(f));
    const Box = (p, text, color) => ({ box: p?.box || null, text, color });
    const s7 = report.shots.SB07, s8 = report.shots.SB08, sbs = {};
    if (Find(7) && s7) sbs.SB07 = await SideBySide("SB07", path.join(SBS, Find(7)), [Box(s7.paint.luo, `罗 ${s7.luo.distM} m ${s7.luo.clip || ""}`, "#ffd23c"),
      ...s7.mg.map((m) => Box(s7.paint[m.role], `${m.role} ${m.distM} m`, "#5cf0ff"))]);
    if (Find(8) && s8) sbs.SB08 = await SideBySide("SB08", path.join(SBS, Find(8)), [Box(s8.gun, "机枪", "#ff8a3c"),
      ...s8.first.map((x) => Box(x.paint, `守军 ${x.id}  ${x.distM} m  ${x.paint.px} px${x.crossing ? "  过口中" : ""}`, "#ffd23c"))]);
    report.sideBySide = sbs;
  }
} catch (error) {
  failure = error; report.failure = String(error?.stack || error);
  console.error("FAILED", error);
  await page.screenshot({ path: path.join(OUT, "Failure.png") }).catch(() => {});
} finally {
  Save();
  await browser.close(); await new Promise((r) => server.close(r));
}

const gating = checks.filter((c) => c.owner === "front" || STRICT);
const bad = gating.filter((c) => !c.ok);
if (errors.length) bad.push({ shot: "page", name: "页面错误", detail: errors.slice(0, 3) });
if (failure) bad.push({ shot: "run", name: "驾驶/抓帧没走完", detail: String(failure?.message || failure) });
const total = gating.length + (errors.length ? 1 : 0) + (failure ? 1 : 0);
console.log(`03 分镜抓帧：${total - bad.length}/${total} 过（等 Set 布景的 ${checks.filter((c) => c.owner === "set").length} 项${STRICT ? "已计入" : "只出图人工看"}）`);
console.log(`检查点重来：驾驶 ${report.retries?.length ?? 0} 次、守阵位 ${report.holdRetries ?? 0} 次`);
if (bad.length) {
  console.log("没过的：");
  for (const c of bad) console.log(`  · ${c.shot} ${c.name}  — ${JSON.stringify(c.detail)}`);
  process.exitCode = 1;
}
