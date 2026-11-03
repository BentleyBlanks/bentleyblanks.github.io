// 白盒 X Bot 身上挂件的运行时取证（2026-11-02，Mixamo 全库审查分包）：在白盒预演里逐帧（固定步长）量每个挂 X Bot 的人：
//   · 挂件（手里的枪、背着的枪、背刀、片段道具……凡是 XBotSkin._ScanAttachments 扫到、看得见、带网格的）进 X Bot 身体多深、
//     离身体表面最近多远（悬空）；人体按审查脚本（Script_MixamoLibraryAudit.mjs）同样的拟合：每根骨一段椭圆截面胶囊，
//     截面半轴取挂在这根骨上的蒙皮顶点的第 85 百分位（偏瘦，报的深度偏保守）；
//   · 挂件世界位姿一帧跳多少：step（一帧挪了多远 / 转了多少，人被预演瞬移 > 3 m 的那帧不算）、glitch（离前后两帧中间位置多远：
//     去了又回来的一帧）、rel（相对 X Bot 挂它的那根骨一帧转了多少：枪相对右手拧了一下就在这里）；
//   · 双手 IK 之后掌心离该握的点多远（XBotSkin.contact）。
// 量衔接的坑（docs/Data_EditorBlockout.md §18）：按世界坐标量；先大步长把整段预跑一遍（动作文件、物理铺设都读完）等两秒再从头量；
// 每批 evaluate 只推 30 帧，中间让出事件循环。
//
//   node Taierzhuang1938/_import/Script_XBotAttachmentProbe.mjs [--levels=FirstLevel0105,FirstLevel0610,FirstLevel1218]
//        [--kf=02-1,02-2] [--out=<file.json>] [--fps=30] [--pages=3] [--shots=<dir>] [--shot=<level>:<kf>:<秒>[:<演员>[:<1|-1|2 机位>]],…]
//        [--xbot-src=<另一份 Script_EditorBlockoutXBot.mjs>]（量改前）
// 输出 JSON：byCategory[类别][关卡] = { frames, depth/gap/step/glitch/rel 的最大值与出处 }，worst = 各指标前几名（不同的人）。
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "..", "..");
const { LaunchBrowser } = await import(pathToFileURL(path.join(repo, "PrairieFire1937", "Script_BrowserTestKit.mjs")));
const { ServeRoot } = await import(pathToFileURL(path.join(repo, "Taierzhuang1938", "Script_DevServer.mjs")));

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.length ? v.join("=") : "1"]; }));
const levels = (flags.levels || "FirstLevel0105,FirstLevel0610,FirstLevel1218").split(",");
const onlyKf = flags.kf ? new Set(flags.kf.split(",")) : null;
const fps = Number(flags.fps || 30);
const pages = Math.max(1, Number(flags.pages || 3));
const shots = flags.shot ? flags.shot.split(",").map((s) => { const [level, kf, t, actor, side] = s.split(":"); return { level, kf, t: Number(t), actor, side: side ? Number(side) : 1 }; }) : [];

let xbotSrc = flags["xbot-src"] ? fs.readFileSync(flags["xbot-src"], "utf8") : null;
if (xbotSrc && !xbotSrc.includes("userData.xbotSkin")) xbotSrc = xbotSrc.replace('this.container.name = "XBotSkin";', 'this.container.name = "XBotSkin"; this.container.userData.xbotSkin = this;');
const server = await ServeRoot(repo, 0), browser = await LaunchBrowser();
const port = server.address().port;
const Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function OpenLevel(level, kf, tries = 2) {
  // 机器忙时开关卡会超时：再开一次
  for (let i = 1; ; i++) {
    try { return await OpenLevelOnce(level, kf); } catch (error) { if (i >= tries) throw error; console.error(`[probe] ${level} 打开失败，重试：`, String(error).slice(0, 120)); }
  }
}

async function OpenLevelOnce(level, kf) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error(`[pageerror ${level}]`, String(e).slice(0, 300)));
  // --xbot-src=<文件>：拿另一份 Script_EditorBlockoutXBot.mjs 顶替（量改前：git show HEAD:… 存下来再喂进来）。
  // 旧版没有 container.userData.xbotSkin 这根回指，照样补上
  if (xbotSrc) await page.route(/Taierzhuang1938\/Script_EditorBlockoutXBot\.mjs/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: xbotSrc }));
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${level}&kf=${kf}&scale=small&audio=0&manual=1`, { waitUntil: "load", timeout: 600000 });
  try { await page.waitForFunction(() => window.Tengxian?.Debug?.Blockout?.State?.().ready, null, { timeout: 900000, polling: 250 }); }
  catch (error) { await page.close().catch(() => {}); throw error; }
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Previz.Reload());
  await page.evaluate(SetupInPage);
  return page;
}

/** 一段预演：大步长预跑 → 等两秒 → 从头逐帧量。 */
async function RunSequence(page, level, kf, durationS) {
  await page.evaluate((kf) => { const P = window.Tengxian.Debug.Blockout.Previz; P.Stop(); P.Play(kf); }, kf);
  await page.waitForFunction((kf) => { const s = window.Tengxian.Debug.Blockout.Previz.State(); return s.playing && s.keyframe === kf; }, kf, { timeout: 60000, polling: 50 });
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => { window.Tengxian.StepFrames(4, 0.25, false); const st = window.Tengxian.Debug.Blockout.Previz.State(); return { t: st.t, kf: st.keyframe, playing: st.playing }; });
    if (!s.playing || s.kf !== kf || s.t >= durationS - 0.3) break;
    await Sleep(30);
  }
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  await Sleep(2000);
  await page.evaluate(({ kf, level }) => { window.__xp.Begin(level, kf); window.Tengxian.Debug.Blockout.Previz.Play(kf); }, { kf, level });
  // 从头那几帧要等预演把人摆好（Play 是异步的）
  await page.waitForFunction((kf) => { const s = window.Tengxian.Debug.Blockout.Previz.State(); return s.playing && s.keyframe === kf; }, kf, { timeout: 60000, polling: 50 });
  for (;;) {
    const s = await page.evaluate(({ n, dt, kf }) => {
      const T = window.Tengxian, P = T.Debug.Blockout.Previz;
      for (let i = 0; i < n; i++) {
        T.StepFrames(1, dt, false);
        const st = P.State();
        if (!st.playing || st.keyframe !== kf) return { done: true };
        window.__xp.Measure(st.t);
      }
      const st = P.State();
      return { done: !st.playing || st.keyframe !== kf || st.t >= st.durationS - 1e-3, t: st.t };
    }, { n: 30, dt: 1 / fps, kf });
    if (s.done) break;
  }
  await page.evaluate(() => window.Tengxian.Debug.Blockout.Previz.Stop());
}

async function ShotAt(page, shot, dir) {
  // 截图：从头按固定步长推到那一秒（不用 Seek：Seek 会 Settle），截前逐帧推几帧
  await page.evaluate((kf) => { const P = window.Tengxian.Debug.Blockout.Previz; P.Stop(); P.Play(kf); }, shot.kf);
  await page.waitForFunction((kf) => window.Tengxian.Debug.Blockout.Previz.State().keyframe === kf, shot.kf, { timeout: 60000 });
  for (;;) {
    const t = await page.evaluate((target) => { const T = window.Tengxian; for (let i = 0; i < 30; i++) { if (T.Debug.Blockout.Previz.State().t >= target) break; T.StepFrames(1, 1 / 30, false); } return T.Debug.Blockout.Previz.State().t; }, shot.t);
    if (t >= shot.t) break;
  }
  // 截前逐帧推 8 帧；预演每帧摆它自己的机位，所以推完再把相机对着那个人、直接画一帧读回画布（不经后期）
  const data = await page.evaluate(({ id, side }) => {
    const T = window.Tengxian;
    T.StepFrames(8, 1 / 30, true);
    window.__xp.Measure(T.Debug.Blockout.Previz.State().t);
    if (id && !window.__xp.LookAt(id, side)) return null;
    T.renderer.render(T.scene, T.camera);
    return T.renderer.domElement.toDataURL("image/png");
  }, { id: shot.actor || null, side: shot.side || 1 });
  if (!data) { console.error("[shot] 找不到", shot.actor); return; }
  const file = path.join(dir, `${shot.level}_${shot.kf}_${shot.t}${shot.actor ? "_" + shot.actor : ""}${shot.side && shot.side !== 1 ? "_s" + shot.side : ""}.png`);
  fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.error("[shot]", file);
}

// ---------------------------------------------------------------- in page
function SetupInPage() {
  const T = window.Tengxian, scene = T.scene;
  let THREEV = null, THREEQ = null, THREEM = null;
  // three 的类从场景里拿（页面没把 THREE 挂到 window）
  THREEV = scene.position.constructor; THREEQ = scene.quaternion.constructor; THREEM = scene.matrixWorld.constructor;
  const VOLUME_BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
    "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"];
  const Pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const v = new THREEV(), tmp = new THREEV(), q = new THREEQ(), q2 = new THREEQ(), sc = new THREEV();
  // 身体胶囊按人物各拟合一份（X Bot / 日兵甲身材不同，2026-11-03）；旧版 XBotSkin 没有 kit，都算 X Bot
  const volumeFits = new Map();
  function FitVolumes(model) {
    const samples = new Map(VOLUME_BONES.map((n) => [n, []]));
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bones = o.skeleton.bones;
      for (let i = 0; i < pos.count; i += 1) {
        let best = -1, bw = 0;
        for (let k = 0; k < 4; k += 1) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        if (bw < 0.6) continue;
        const name = bones[best].name;
        if (!samples.has(name)) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[best]);
        samples.get(name).push([v.x, v.y, v.z]);
      }
    });
    const out = [];
    for (const [name, pts] of samples) {
      if (pts.length < 20) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]);
      const cx = Pct(xs, 0.5), cz = Pct(zs, 0.5);
      out.push({ name, cx, cz, rx: Pct(xs.map((x) => Math.abs(x - cx)), 0.85), rz: Pct(zs.map((z) => Math.abs(z - cz)), 0.85), y0: Pct(ys, 0.05), y1: Pct(ys, 0.95) });
    }
    return out;
  }
  function PropPoints(root, voxel) {
    root.updateMatrixWorld(true);
    const inv = new THREEM().copy(root.matrixWorld).invert(), seen = new Map();
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      let vis = true; for (let p = o; p && p !== root; p = p.parent) if (p.visible === false) { vis = false; break; }
      if (!vis) return;
      const rel = new THREEM().multiplyMatrices(inv, o.matrixWorld), pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(rel);
        const key = `${Math.round(v.x / voxel)},${Math.round(v.y / voxel)},${Math.round(v.z / voxel)}`;
        if (!seen.has(key)) seen.set(key, [v.x, v.y, v.z]);
      }
    });
    const pts = [...seen.values()];
    let c = [0, 0, 0]; for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    if (pts.length) c = c.map((x) => x / pts.length);
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    return { pts, c, r };
  }
  const Visible = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  function Category(skin, a) {
    const o = a.object, n = o.name || "";
    if (a.holdsWeapon || o === skin.actor.weaponGroup) return "手里的枪";
    const Has = (x) => { if (!x) return false; for (let p = x; p; p = p.parent) if (p === o) return true; return false; };
    if (Has(skin.rig.relaxedGaitRifle) || /RelaxedGaitBackRifle/.test(n)) return "背枪(步态)";
    if (Has(skin.rig.openingSlungRifle) || /SlungRifle/.test(n)) return "背枪(开场)";
    if (/HeadGear|Helmet|Cap/i.test(n) || a.xbotBone?.name === "Head") return "头上(" + n + ")";
    if (/Blade|Sheath|Scabbard|Sword/i.test(n)) return "刀(" + n + ")";
    return `其他(${n || "?"}@${a.xbotBone?.name || "?"})`;
  }
  const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
  const props = new WeakMap();
  const state = new Map();   // skin → { id, prev: Map(object → [poses]) }
  const agg = {};            // cat → level → metric → { v, where }
  const worst = [];          // { metric, cat, v, where }
  let level = null, kf = null, frame = 0, idMap = new Map();
  function Skins() { const out = []; scene.traverse((o) => { const s = o.userData?.xbotSkin; if (s && s.container.visible) out.push(s); }); return out; }
  function RefreshIds(skins) {
    let st = null; try { st = T.Debug.Blockout.XBot(); } catch (e) { return; }
    for (const s of skins) {
      if (idMap.has(s)) continue;
      const h = s.H("Hips")?.getWorldPosition(new THREEV());
      let best = null, bd = 0.05;
      for (const hu of st.humans || []) { if (!hu.hips) continue; const d = Math.hypot(hu.hips[0] - h.x, hu.hips[1] - h.y, hu.hips[2] - h.z); if (d < bd) { bd = d; best = hu; } }
      if (best) idMap.set(s, `${best.id}${best.slot && best.slot !== "main" ? "/" + best.slot : ""}`);
    }
  }
  function Keep(cat, metric, value, where) {
    if (!(value > 0)) return;
    const L = ((agg[cat] ||= {})[level] ||= { frames: 0 });
    if (!L[metric] || value > L[metric].v) L[metric] = { v: +value.toFixed(3), ...where };
    worst.push({ metric, cat, v: +value.toFixed(3), ...where });
    if (worst.length > 4000) Trim();
  }
  function Count(cat, metric, where = null) {
    const L = ((agg[cat] ||= {})[level] ||= { frames: 0 }); L[metric] = (L[metric] || 0) + 1;
    // 按「动作 [挂法]」分摊，看超标的帧多在哪几条动作上
    if (where) { const by = (L[metric + "By"] ||= {}), k = `${String(where.pick || "?").replace(/^Animation_Mixamo_|^Derived\/Animation_XBot_|\.glb$/g, "")} [${where.mount || "-"}]`; by[k] = (by[k] || 0) + 1; }
  }
  function Trim() {
    // 每个（指标, 类别）留前 8 个不同的人（同一个人只留最大那一帧）
    const groups = new Map();
    for (const w of worst) { const k = `${w.metric}|${w.cat}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); }
    worst.length = 0;
    for (const list of groups.values()) {
      list.sort((a, b) => b.v - a.v);
      const seen = new Set();
      for (const w of list) { const who = `${w.level}|${w.kf}|${w.who}`; if (seen.has(who)) continue; seen.add(who); worst.push(w); if (seen.size >= 8) break; }
    }
  }
  function BodyVolumes(skin) {
    const kind = skin.kit?.key || "xbot";
    if (!volumeFits.has(kind)) volumeFits.set(kind, FitVolumes(skin.model));
    return volumeFits.get(kind).map((f) => {
      const bone = skin.H(f.name);
      const inv = new THREEM().copy(bone.matrixWorld).invert(), scale = bone.matrixWorld.getMaxScaleOnAxis();
      const center = new THREEV(f.cx, (f.y0 + f.y1) / 2, f.cz).applyMatrix4(bone.matrixWorld);
      const radius = (Math.hypot(Math.max(f.rx, f.rz), (f.y1 - f.y0) / 2) + Math.max(f.rx, f.rz)) * scale;
      return { ...f, bone, inv, scale, center, radius };
    });
  }
  // 点（世界）离这段胶囊表面的有符号距离（m，> 0 在里面）；椭圆归一化后按短半轴折米，近表面准、远了只作参考
  function Signed(vol, world) {
    tmp.copy(world).applyMatrix4(vol.inv);
    const k = Math.min(vol.rx, vol.rz);
    const dy = tmp.y < vol.y0 ? vol.y0 - tmp.y : tmp.y > vol.y1 ? tmp.y - vol.y1 : 0;
    const e = Math.hypot((tmp.x - vol.cx) / vol.rx, (tmp.z - vol.cz) / vol.rz, dy / k);
    return (1 - e) * k * vol.scale;
  }
  window.__xp = {
    Begin(L, K) { level = L; kf = K; frame = 0; state.clear(); idMap = new Map(); },
    Measure(t) {
      frame += 1;
      const skins = Skins();
      if (frame % 15 === 1) RefreshIds(skins);
      for (const skin of skins) {
        let S = state.get(skin);
        if (!S) state.set(skin, S = { prev: new Map(), at: null });
        const at = skin.container.getWorldPosition(new THREEV());
        const teleport = S.at && at.distanceTo(S.at) > 3;
        S.at = at;
        const who = idMap.get(skin) || skin.look.key;
        const pick = !skin.pick ? null : skin.pick.mode === "mirror" ? "mirror" : skin.pick.key || skin.pick.file;
        const where = { level, kf, t: +t.toFixed(2), frame, who, pick, mount: skin.lastMount || null };
        const early = frame <= 3;   // 预演把人摆到起点的那几帧不算跳变
        let vols = null;
        const seen = new Set();
        const targets = [];
        for (const a of skin.attachments) {
          const cat0 = Category(skin, a);
          // 手里的枪量枪本身（weaponGroup）：_PlaceWeapon 只挪它，挂点（RuntimeGrip_WeaponR）留在藏起来的原身体手上
          // 背着的枪同理量枪本身（_RifleSwapStep 挪的是它，不是 RelaxedGaitBackRifleMount）；背带另算一类
          if (cat0 === "手里的枪" && skin.actor.weaponGroup) targets.push([a, cat0, skin.actor.weaponGroup]);
          else if (cat0 === "背枪(步态)") {
            if (skin.rig.relaxedGaitRifle) targets.push([a, cat0, skin.rig.relaxedGaitRifle]);
            if (skin.rig.relaxedGaitSling) targets.push([a, "背带(步态)", skin.rig.relaxedGaitSling]);
          } else if (cat0 === "背枪(开场)" && skin.rig.openingSlungRifle) targets.push([a, cat0, skin.rig.openingSlungRifle]);
          else targets.push([a, cat0, a.object]);
        }
        for (const [a, cat, o] of targets) {
          if (!o.parent || !Visible(o)) continue;
          // 点按「看得见的网格」重取（换枪、片段把某一截藏起来）
          let sig = 0; o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh && Visible(m)) sig += 1 + (m.id % 997) * 1e-3; });
          let P = props.get(o);
          if (!P || P.version !== sig) { P = PropPoints(o, 0.02); P.version = sig; props.set(o, P); }
          if (!P.pts.length) continue;
          seen.add(o);
          const L = ((agg[cat] ||= {})[level] ||= { frames: 0 }); L.frames += 1;
          vols ||= BodyVolumes(skin);
          o.updateMatrixWorld(true);
          const M = o.matrixWorld, sc0 = M.getMaxScaleOnAxis();
          const cw = new THREEV(P.c[0], P.c[1], P.c[2]).applyMatrix4(M), cr = P.r * sc0;
          // 进身体多深（按骨）、离身体表面最近多远
          let depth = 0, depthBone = null, depthZ = 0, gap = Infinity, gapBone = null;
          for (const vol of vols) {
            if (cw.distanceTo(vol.center) > vol.radius + cr + 0.3) continue;
            for (const p of P.pts) {
              v.set(p[0], p[1], p[2]).applyMatrix4(M);
              if (v.distanceTo(vol.center) > vol.radius + 0.3) continue;
              const s = Signed(vol, v);
              if (s > depth) { depth = s; depthBone = vol.name; depthZ = p[2]; }
              if (-s < gap) { gap = -s; gapBone = vol.name; }
            }
          }
          if (depth > 0) Keep(cat, "depth", depth, { ...where, bone: depthBone, z: +depthZ.toFixed(2) });
          if (depth > 0.03) Count(cat, "depthOver3cm", where);
          if (depth <= 0 && Number.isFinite(gap)) Keep(cat, "gap", gap, { ...where, bone: gapBone });
          // 位姿跳变
          M.decompose(v, q, sc);
          const anchor = cat === "手里的枪" ? skin.H(skin.rifleOnLeft || skin.lastMount === "handL" ? "LeftHand" : "RightHand") : a.xbotBone;
          const rel = anchor ? anchor.getWorldQuaternion(new THREEQ()).invert().multiply(q.clone()) : null;
          const pose = { p: v.clone(), q: q.clone(), rel };
          let hist = S.prev.get(o);
          if (!hist || teleport || early) S.prev.set(o, hist = []);
          hist.push(pose);
          if (hist.length > 3) hist.shift();
          if (hist.length >= 2) {
            const [b, c] = hist.slice(-2);
            const stepM = c.p.distanceTo(b.p), stepDeg = angle(c.q, b.q);
            Keep(cat, "stepM", stepM, where); Keep(cat, "stepDeg", stepDeg, where);
            if (c.rel && b.rel) { const r = angle(c.rel, b.rel); Keep(cat, "relDeg", r, where); if (r > 8) Count(cat, "relOver8deg", where); }
          }
          if (hist.length === 3) {
            const [a0, b, c] = hist;
            const gm = b.p.distanceTo(a0.p.clone().lerp(c.p, 0.5)), gd = angle(b.q, a0.q.clone().slerp(c.q, 0.5));
            Keep(cat, "glitchM", gm, { ...where, frame: frame - 1 }); Keep(cat, "glitchDeg", gd, { ...where, frame: frame - 1 });
            if (gm > 0.03 || gd > 8) Count(cat, "glitchCount", where);
          }
          if (cat === "手里的枪" && skin.contact) {
            for (const side of ["R", "L"]) {
              const c = skin.contact[side];
              if (c !== null && c !== undefined) { Keep(cat, "contact" + side, c, where); if (c > 0.03) Count(cat, "contact" + side + "Over3cm", where); }
            }
          }
        }
        for (const o of [...S.prev.keys()]) if (!seen.has(o)) S.prev.delete(o);
      }
    },
    Result() { Trim(); return { agg, worst }; },
    LookAt(id, sideSign = 1) {
      // 截图机位：对着那个人胸口，侧前方约 1.6 m（side = -1 换另一侧，2 = 背后）
      const skin = [...idMap.entries()].find(([, v]) => v === id)?.[0] || Skins().find((s) => s.look.key === id);
      if (!skin) return false;
      const h = skin.H("Hips").getWorldPosition(new THREEV());
      skin.container.matrixWorld.decompose(tmp, q2, sc);
      const fwd = new THREEV(0, 0, 1).applyQuaternion(q2), side = new THREEV(1, 0, 0).applyQuaternion(q2);
      const eye = sideSign === 2 ? h.clone().addScaledVector(fwd, -1.6).addScaledVector(side, 0.4) : h.clone().addScaledVector(fwd, 1.2).addScaledVector(side, 1.0 * sideSign);
      eye.y = h.y + 0.35;
      T.Debug.Blockout.Previz.State();
      const cam = T.camera; cam.position.copy(eye); cam.lookAt(h.x, h.y + 0.15, h.z); cam.updateMatrixWorld(true);
      return true;
    },
  };
  return true;
}

// ---------------------------------------------------------------- main
const result = { when: new Date().toISOString(), fps, levels: {}, byCategory: {}, worst: [] };
try {
  const config = Object.fromEntries(levels.map((L) => [L, JSON.parse(fs.readFileSync(path.join(repo, "Taierzhuang1938", "Blockout", `${L}.previz.json`), "utf8"))]));
  if (shots.length) {
    const dir = flags.shots || path.join(repo, "Taierzhuang1938", "_shots", "XBotAttachmentProbe");
    fs.mkdirSync(dir, { recursive: true });
    for (const L of [...new Set(shots.map((s) => s.level))]) {
      const page = await OpenLevel(L, shots.find((s) => s.level === L).kf);
      for (const s of shots.filter((x) => x.level === L)) {
        await page.evaluate(({ kf, level }) => window.__xp.Begin(level, kf), s);
        // 先让 __xp 认人（LookAt 按 XBot() 的 id 找）
        await ShotAt(page, s, dir).catch((e) => console.error("[shot failed]", String(e)));
      }
      await page.close();
    }
  } else {
    const jobs = levels.flatMap((L) => config[L].sequences.filter((s) => !onlyKf || onlyKf.has(s.keyframe)).map((s) => ({ level: L, kf: s.keyframe, dur: s.durationS })));
    const byLevel = new Map(levels.map((L) => [L, jobs.filter((j) => j.level === L)]));
    // 每关一页（同一页里按段跑），最多 pages 页并行
    const queue = [...byLevel.entries()].filter(([, j]) => j.length);
    const merged = [];
    async function Worker() {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [L, list] = next;
        const t0 = Date.now();
        const page = await OpenLevel(L, list[0].kf);
        for (const j of list) {
          const t1 = Date.now();
          try { await RunSequence(page, L, j.kf, j.dur); } catch (e) { console.error(`[${L} ${j.kf}]`, String(e).slice(0, 300)); }
          console.error(`[probe] ${L} ${j.kf} ${((Date.now() - t1) / 1000).toFixed(0)} s`);
        }
        merged.push(await page.evaluate(() => window.__xp.Result()));
        result.levels[L] = { sequences: list.length, seconds: Math.round((Date.now() - t0) / 1000) };
        await page.close();
      }
    }
    await Promise.all(Array.from({ length: Math.min(pages, queue.length) }, Worker));
    for (const m of merged) {
      for (const [cat, byL] of Object.entries(m.agg)) Object.assign(result.byCategory[cat] ||= {}, byL);
      result.worst.push(...m.worst);
    }
    // 各指标各类别前 6
    const groups = new Map();
    for (const w of result.worst) { const k = `${w.metric}|${w.cat}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); }
    result.worst = [...groups.values()].flatMap((g) => g.sort((a, b) => b.v - a.v).slice(0, 6));
  }
} finally {
  await browser.close(); server.close();
}
const text = JSON.stringify(result, null, 1);
if (flags.out) fs.writeFileSync(flags.out, text); else console.log(text);
