// 《滕县 一九三八》场景破坏冒烟：在真浏览器里拆墙、拆楼板、炸一组布景。
//
// 用法：node Taierzhuang1938/Script_DestructionTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1120, height: 700 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=5&quality=low&scale=small`,
  { waitUntil: "load", timeout: 180000 });
await page.waitForFunction(() => window.Taierzhuang?.destruction, { timeout: 240000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(30));

// 1. 七关共用的 BuildSink 已把承重语义写进运行时碰撞记录。
{
  const stats = await page.evaluate(() => window.Taierzhuang.Debug.Destruction());
  Check("当前场景有大批可破坏布景", stats && stats.destructible > 250,
    stats ? `可破坏 ${stats.destructible}` : "没有破坏系统");
  Check("承重结构被单独分类", stats && stats.structural > 20,
    stats ? `承重 ${stats.structural}` : "");
}

// 正式玩法暂时不允许破坏场景；专项冒烟随后显式进入预览模式。
{
  const gate = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const box = T.battlefield.colliders.find((candidate) => candidate.destruction?.destructible);
    if (!box) return { missing: true };
    const center = box.c || [
      (box.min[0] + box.max[0]) * 0.5,
      (box.min[1] + box.max[1]) * 0.5,
      (box.min[2] + box.max[2]) * 0.5,
    ];
    const count = T.battlefield.colliders.length;
    const result = T.destruction.Hit(box,
      { x: center[0], y: center[1], z: center[2] }, 1000000,
      { kind: "shell", normal: { x: 0, y: 0, z: 1 } });
    const unchanged = T.battlefield.colliders.length === count
      && T.battlefield.colliders.includes(box) && !T.destruction.damage.has(box);
    const before = T.Debug.Destruction();
    T.destruction.SetPreviewMode(true);
    const after = T.Debug.Destruction();
    return { result, unchanged, before, after };
  });
  Check("正式玩法暂时关闭场景破坏", !gate.missing && gate.result?.disabled
    && gate.unchanged && !gate.before?.gameplayEnabled && !gate.before?.previewMode,
  gate.missing ? "没有可破坏候选" : `disabled=${gate.result?.disabled}`);
  Check("专项测试可显式进入预览模式", gate.after?.previewMode && !gate.after?.gameplayEnabled,
    `preview=${gate.after?.previewMode}`);
}

// 2. 城墙本体是明确白名单：再大的伤害也不摘 Rapier 盒。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const box = T.battlefield.colliders.find((candidate) => candidate.tag === "cityWall");
    if (!box) return { missing: true };
    const count = T.battlefield.colliders.length;
    const handle = box._physicsHandle;
    const result = T.Debug.DamageCollider(box, 1000000, "shell", { x: 0, y: 0, z: 1 });
    return {
      result,
      sameRecord: T.battlefield.colliders.includes(box),
      sameHandle: box._physicsHandle === handle,
      countSame: T.battlefield.colliders.length === count,
    };
  });
  Check("承重城墙不会被破坏", !r.missing && r.result?.protected
    && r.sameRecord && r.sameHandle && r.countSame,
  r.missing ? "没找到 cityWall" : `protected=${r.result?.protected} handle=${r.sameHandle}`);
}

// 3. 普通墙先出现损伤阶段，随后形成一只真正可通行的局部洞口。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const box = T.battlefield.colliders.find((candidate) => {
      if (candidate.tag !== "wall" || !candidate.h || !candidate.c) return false;
      const horizontalThin = Math.min(candidate.h[0], candidate.h[2]);
      const horizontalLong = Math.max(candidate.h[0], candidate.h[2]);
      return horizontalThin < 0.65 && horizontalLong > 1.6 && candidate.h[1] > 0.8;
    });
    if (!box) return { missing: true };
    const c = box.c.slice(), h = box.h.slice(), ry = box.ry || 0;
    const longX = h[0] >= h[2];
    // AddWall 的长轴是局部 x，薄轴是局部 z。其它细长盒反过来时取局部 x 法向。
    const normal = longX
      ? { x: Math.sin(ry), y: 0, z: Math.cos(ry) }
      : { x: Math.cos(ry), y: 0, z: -Math.sin(ry) };
    const thickness = longX ? h[2] : h[0];
    const origin = {
      x: c[0] - normal.x * (thickness + 0.45),
      y: box.min[1] + Math.min(1.0, h[1]),
      z: c[2] - normal.z * (thickness + 0.45),
    };
    const beforeNav = T.nav.Stats().revisions;
    const staged = T.destruction.Hit(box, origin, 150,
      { kind: "bullet", normal });
    const stillThere = T.battlefield.colliders.includes(box);
    const broken = T.destruction.Hit(box, origin, 1200,
      { kind: "shell", normal });
    T.destruction.Update(T.player.position);
    T.StepFrames(2);
    const through = T.battlefield.Raycast(origin, normal, thickness * 2 + 0.9);
    const stats = T.Debug.Destruction();
    const breach = T.destruction.breaches.at(-1);
    const firstFragment = T.destruction.fragmentStates[0];
    const beforePosition = firstFragment?.position.toArray() || null;
    T.StepFrames(10);
    const afterPosition = firstFragment?.position.toArray() || null;
    const moved = beforePosition && afterPosition
      ? Math.hypot(afterPosition[0] - beforePosition[0], afterPosition[1] - beforePosition[1],
        afterPosition[2] - beforePosition[2])
      : 0;
    const colors = T.destruction.fragmentStates.map((state) => state.color);
    const minimumLuma = colors.length ? Math.min(...colors.map((hex) => {
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    })) : 0;
    const lining = T.destruction.breachMesh;
    const oldBlackPlaceholder = T.scene.getObjectByName("Destruction_Rubble");
    for (let frame = 0; frame < 360; frame += 1) {
      T.destruction.Update(T.player.position, 1 / 60);
    }
    const fragmentsAfterExpiry = T.destruction.Stats().flyingFragments;
    return {
      staged, stillThere, broken,
      originalGone: !T.battlefield.colliders.includes(box),
      through: through ? through.t : null,
      maxDistance: thickness * 2 + 0.9,
      stats,
      navAdvanced: T.nav.Stats().revisions === beforeNav + 1,
      patternId: breach.patternId,
      patternRadii: breach.patternIndex >= 0,
      liningHasThickness: lining.geometry.userData.hasThickness
        && lining.geometry.getAttribute("normal")?.count > 0
        && lining.geometry.index?.count >= 216,
      liningOpaque: !lining.material.transparent && lining.material.depthWrite
        && lining.userData.usesDestructionShader === false,
      fragmentsArePrebaked: T.destruction.fragments.userData.prefracturedTemplateCount >= 216,
      fragmentCount: stats.flyingFragments,
      fragmentMoved: moved,
      minimumLuma,
      oldBlackPlaceholder: !!oldBlackPlaceholder,
      fragmentsAfterExpiry,
    };
  });
  Check("墙面有分阶段耐久", !r.missing && r.staged?.damaged && !r.staged?.broken && r.stillThere,
    r.missing ? "没找到细长 wall" : `ratio=${Number(r.staged?.ratio || 0).toFixed(2)}`);
  Check("墙体只移除命中局部并打开物理通路", !r.missing && r.broken?.broken
    && r.originalGone && r.through === null,
  r.missing ? "" : `ray=${r.through ?? "clear"} max=${Number(r.maxDistance).toFixed(2)}`);
  Check("不规则破口、真实厚度断面与导航一起提交", !r.missing && r.stats?.breaches === 1
    && r.stats.activeVolumes === 1 && r.stats.breachLinings === 1
    && r.patternId && r.patternRadii && r.liningHasThickness && r.liningOpaque && r.navAdvanced,
  r.missing ? "" : `洞=${r.stats?.breaches} pattern=${r.patternId} nav=${r.navAdvanced}`);
  Check("每个缺口生成三十六块对应预烘焙碎片并逐帧飞散", !r.missing
    && r.fragmentsArePrebaked && r.fragmentCount === 36 && r.fragmentMoved > 0.02,
  r.missing ? "" : `碎块=${r.fragmentCount} 位移=${Number(r.fragmentMoved).toFixed(3)}m`);
  Check("碎片色板有亮度底线且旧纯黑常驻块已移除", !r.missing
    && r.minimumLuma >= 0.42 && !r.oldBlackPlaceholder && r.fragmentsAfterExpiry === 0,
  r.missing ? "" : `最低亮度=${Number(r.minimumLuma).toFixed(2)} 旧占位=${r.oldBlackPlaceholder} 到期=${r.fragmentsAfterExpiry}`);
}

// 4. 第一关石墙村的新村屋不是纯装饰：墙、瓦顶、院墙、木门和农具都有分件代理。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    await T.JumpToPhase(0);
    T.StepFrames(40);
    const nearVillage = T.battlefield.colliders.filter((box) => {
      const c = box.c || [
        (box.min[0] + box.max[0]) * 0.5,
        (box.min[1] + box.max[1]) * 0.5,
        (box.min[2] + box.max[2]) * 0.5,
      ];
      return Math.hypot(c[0] + 160, c[2] + 1350) < 92;
    });
    const tags = {};
    for (const box of nearVillage) tags[box.tag] = (tags[box.tag] || 0) + 1;
    const wall = nearVillage.find((box) => box.tag === "villageWall" && box.h?.[1] > 0.8);
    const roofs = nearVillage.filter((box) => box.tag === "villageRoof" && box.h?.[1] > 0.2);
    // 组合院落有相邻厢房；专项射线选一片中心不落入其它瓦顶 OBB 的坡面，
    // 避免“打穿 A 顶又命中 B 顶”被误报成 A 留下隐形碰撞。
    const roof = roofs.find((candidate) => roofs.every((other) => {
      if (other === candidate) return true;
      const dx = candidate.c[0] - other.c[0], dz = candidate.c[2] - other.c[2];
      const cos = Math.cos(other.ry || 0), sin = Math.sin(other.ry || 0);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      return Math.abs(localX) > other.h[0] - 0.04 || Math.abs(localZ) > other.h[2] - 0.04;
    }));
    const straw = nearVillage.find((box) => box.tag === "villageStraw");
    if (!wall || !roof || !straw) return { missing: true, tags };

    const wallC = wall.c.slice(), wallH = wall.h.slice(), wallRy = wall.ry || 0;
    const wallNormal = { x: Math.sin(wallRy), y: 0, z: Math.cos(wallRy) };
    const wallOrigin = {
      x: wallC[0] - wallNormal.x * (wallH[2] + 0.35),
      y: wall.min[1] + Math.min(0.95, wallH[1]),
      z: wallC[2] - wallNormal.z * (wallH[2] + 0.35),
    };
    const staged = T.destruction.Hit(wall, wallOrigin, 150,
      { kind: "bullet", normal: wallNormal });
    const wallBroken = T.destruction.Hit(wall, wallOrigin, 1200,
      { kind: "shell", normal: wallNormal });
    const wallRay = T.battlefield.Raycast(wallOrigin, wallNormal, wallH[2] * 2 + 0.7);

    const roofC = roof.c.slice(), roofH = roof.h.slice();
    const roofOrigin = { x: roofC[0], y: roofC[1] + roofH[1] + 0.28, z: roofC[2] };
    const roofBroken = T.destruction.Hit(roof, roofOrigin, 520,
      { kind: "shell", normal: { x: 0, y: 1, z: 0 } });
    const roofRay = T.battlefield.Raycast(roofOrigin, { x: 0, y: -1, z: 0 }, roofH[1] * 2 + 0.5);

    const strawC = straw.c.slice();
    const beforeBlast = T.Debug.Destruction();
    const blast = T.destruction.Blast(
      { x: strawC[0], y: strawC[1], z: strawC[2] }, 1.8, 420, { kind: "grenade" });
    T.destruction.Update({ x: -160, y: strawC[1], z: -1350 });
    T.StepFrames(3);
    const after = T.Debug.Destruction();
    return {
      tags,
      profiles: {
        wall: T.destruction.Profile(wall).id,
        roof: T.destruction.Profile(roof).id,
        straw: T.destruction.Profile(straw).id,
      },
      staged,
      wallBroken,
      roofBroken,
      blast,
      wallGone: !T.battlefield.colliders.includes(wall),
      roofGone: !T.battlefield.colliders.includes(roof),
      strawGone: !T.battlefield.colliders.includes(straw),
      wallRay: wallRay ? wallRay.t : null,
      roofRay: roofRay ? roofRay.t : null,
      roofRayTag: roofRay?.box?.tag || null,
      topologyDelta: after.topologyRebuilds - beforeBlast.topologyRebuilds,
      stats: after,
    };
  });
  Check("当前第一关确实生成分件村屋碰撞", !r.missing
    && r.tags?.villageWall >= 20 && r.tags?.villageRoof >= 10
    && r.tags?.villageFoundation >= 5 && r.tags?.villageStoneWall >= 8,
  r.missing ? `缺少代理 ${JSON.stringify(r.tags)}`
    : `墙 ${r.tags.villageWall} 顶 ${r.tags.villageRoof} 基 ${r.tags.villageFoundation} 石墙 ${r.tags.villageStoneWall}`);
  Check("村屋墙体累积受损后形成可通行破口", !r.missing
    && r.profiles?.wall === "masonry" && r.staged?.damaged && !r.staged?.broken
    && r.wallBroken?.broken && r.wallGone && r.wallRay === null,
  r.missing ? "" : `profile=${r.profiles?.wall} ray=${r.wallRay ?? "clear"}`);
  Check("瓦顶可独立打碎且不会留下隐形碰撞", !r.missing
    && r.profiles?.roof === "roofTile" && r.roofBroken?.broken
    && r.roofGone && r.roofRay === null,
  r.missing ? "" : `profile=${r.profiles?.roof} ray=${r.roofRay ?? "clear"} tag=${r.roofRayTag ?? "none"}`);
  Check("草垛会被爆炸摧毁并刷新物理拓扑", !r.missing
    && r.profiles?.straw === "straw" && r.blast?.broken >= 1
    && r.strawGone && r.topologyDelta === 1,
  r.missing ? "" : `破坏=${r.blast?.broken} 拓扑+${r.topologyDelta}`);
}

// 5. 换到北沙河：站台/木桥是楼板语义，向下打一只洞后竖直射线要穿过。
{
  const r = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    await T.JumpToPhase(1);
    T.StepFrames(30);
    const reset = T.Debug.Destruction();
    const box = T.battlefield.colliders.find((candidate) =>
      (candidate.tag === "platform" || candidate.tag === "bridge")
      && candidate.h && candidate.h[1] < Math.max(candidate.h[0], candidate.h[2]));
    if (!box) return { missing: true, reset };
    const c = box.c.slice(), h = box.h.slice();
    const origin = { x: c[0], y: c[1] + h[1] + 0.35, z: c[2] };
    const normal = { x: 0, y: 1, z: 0 };
    const result = T.destruction.Hit(box, origin, 700, { kind: "shell", normal });
    T.destruction.Update(T.player.position);
    T.StepFrames(2);
    const through = T.battlefield.Raycast(origin, { x: 0, y: -1, z: 0 }, h[1] * 2 + 0.7);
    return {
      tag: box.tag, result, through: through ? through.t : null,
      reset, stats: T.Debug.Destruction(), originalGone: !T.battlefield.colliders.includes(box),
    };
  });
  Check("换场景会清空上一关破口", r.reset && r.reset.breaches === 0 && r.reset.activeVolumes === 0,
    r.reset ? `洞=${r.reset.breaches} active=${r.reset.activeVolumes}` : "");
  Check("楼板/木桥可以打穿并形成坠落洞", !r.missing && r.result?.broken
    && r.originalGone && r.through === null,
  r.missing ? "没找到 platform/bridge" : `${r.tag} ray=${r.through ?? "clear"}`);
}

// 6. 一次爆炸无论拆几块，都只重建一次碰撞格和导航。
{
  const r = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const candidates = T.battlefield.colliders.filter((box) =>
      box.destruction?.destructible && box.tag !== "platform" && box.tag !== "bridge");
    const box = candidates.find((candidate) => candidate.tag === "prop") || candidates[0];
    if (!box) return { missing: true };
    const c = box.c || [
      (box.min[0] + box.max[0]) * 0.5,
      (box.min[1] + box.max[1]) * 0.5,
      (box.min[2] + box.max[2]) * 0.5,
    ];
    const before = T.Debug.Destruction();
    const result = T.destruction.Blast({ x: c[0], y: c[1], z: c[2] }, 4.5, 1800, { kind: "shell" });
    T.destruction.Update(T.player.position);
    const after = T.Debug.Destruction();
    return { result, before, after };
  });
  Check("爆炸会批量破坏附近布景", !r.missing && r.result?.broken >= 1,
    r.missing ? "没有候选" : `命中=${r.result?.hits} 破坏=${r.result?.broken}`);
  Check("一次爆炸只做一次拓扑重建", !r.missing
    && r.after.topologyRebuilds === r.before.topologyRebuilds + 1,
  r.missing ? "" : `${r.before?.topologyRebuilds} -> ${r.after?.topologyRebuilds}`);
}

// 新 shader 路径在真的破口激活后仍不得产生 WebGL 错误。
{
  const closed = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.destruction.SetPreviewMode(false);
    return T.Debug.Destruction();
  });
  Check("专项测试结束后重新关闭破坏权限", !closed.previewMode && !closed.gameplayEnabled,
    `preview=${closed.previewMode}`);
  const glError = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.StepFrames(6);
    return T.renderer.getContext().getError();
  });
  Check("破口激活后的渲染管线健康", glError === 0, `gl=${glError}`);
}

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
if (problems.length) {
  console.log(`\n运行时报错 ${problems.length} 条：`);
  for (const problem of problems.slice(0, 12)) console.log(`  ${problem}`);
}
if (failed.length || problems.length) {
  console.log(`\n破坏冒烟没过：${failed.length} 条断言 + ${problems.length} 条报错`);
  process.exit(1);
}
console.log("\n场景破坏冒烟全过。");
