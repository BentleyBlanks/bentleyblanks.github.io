// 场景数据体检 / 清单打印。
//
// 把 Data_Scenes.json × Data_PropArt.json 合起来算一遍，逐条列出「每个物体在哪、
// 埋多深、用哪支画笔、烘多大一张贴图」，并做交叉校验。要挪东西、换贴图、
// 查"这玩意儿怎么不见了"，先跑这个。
//
// 用法：
//   node TunnelLight1943/Script_SceneAudit.mjs            列出全部场景
//   node TunnelLight1943/Script_SceneAudit.mjs village    只看一个场景
//   node TunnelLight1943/Script_SceneAudit.mjs --json     机器可读（给别的工具用）
//   node TunnelLight1943/Script_SceneAudit.mjs --quiet    只报问题（跑在测试里的那档）
//
// 注：别在 npm script 里用 `> /dev/null` 收声——Windows 上 npm 走 cmd，那是个错。
import { SCENES, PROP_ART, COVER_ART, SpriteOf, CoverBandOf, PPM } from "./Data_Scenes.mjs";
import { BAND, NEAR_CLUTTER } from "./Data_DepthSpec.mjs";
import { Hash } from "./Script_Art.mjs";
import { SCRIPTS, CHAPTERS } from "./Script_Core.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const quiet = args.includes("--quiet");
const only = args.filter((a) => !a.startsWith("--"));

const BAND_NAME = Object.fromEntries(Object.entries(BAND).map(([k, v]) => [v, k]));
const problems = [];   // 会出事的：退出码 1
const notes = [];      // 值得看一眼的：不算失败

// 剧本里真正「把东西放到地上」的位置。区域坐在掩体上本身不是错——潜行观察点
// 就该以掩体命名——只有当那儿是放东西的地方时，掩体带才会把东西吞掉。
// zone 是冻结的同一个对象，按引用回查它属于哪个场景。
function DropZones() {
  const out = [];
  for (const ch of CHAPTERS) {
    for (const def of SCRIPTS[ch.id] || []) {
      if (def.kind !== "chain") continue;
      for (const st of def.steps || []) {
        if (st.type === "drop" && st.zone) out.push({ scene: ch.scene, beat: def.id, zone: st.zone });
      }
    }
  }
  return out;
}
const DROP_ZONES = DropZones();

function Rows(sceneKey, scene) {
  const out = [];
  for (const p of scene.props || []) {
    const S = SpriteOf(p.kind, p);
    out.push({
      scene: sceneKey, group: "prop", id: p.id, kind: p.kind,
      x: p.x, level: p.level || "surface", w: p.w ?? null, h: p.h ?? null,
      z: S ? S.z : null, band: S ? BAND_NAME[S.z] ?? String(S.z) : "—",
      art: S ? S.art : `（${PROP_ART[p.kind].drawnBy} 画）`,
      sprite: S ? `${Math.round(S.w)}×${Math.round(S.h)} @${S.ss}x` : "—",
      gate: [p.showFlag && `+${p.showFlag}`, p.hideFlag && `-${p.hideFlag}`].filter(Boolean).join(" ") || "",
      name: p.name || "",
    });
  }
  for (const c of scene.covers || []) {
    const S = SpriteOf(c.kind, c, { cover: true });
    const z = CoverBandOf(c, Hash("cz" + c.id));
    out.push({
      scene: sceneKey, group: "cover", id: c.id, kind: c.kind,
      x: c.x, level: "surface", w: c.w ?? null, h: c.h ?? null,
      z, band: BAND_NAME[z] ?? String(z),
      art: S ? S.art : `（${COVER_ART[c.kind].drawnBy} 画）`,
      sprite: S ? `${Math.round(S.w)}×${Math.round(S.h)} @${S.ss}x` : "—",
      gate: c.tall ? "tall" : "",
      name: c.id,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 交叉校验
// ---------------------------------------------------------------------------
function Audit(sceneKey, scene, rows) {
  const covers = (scene.covers || []).map((c) => ({
    id: c.id, x0: c.x - (c.w || 2) / 2, x1: c.x + (c.w || 2) / 2,
  }));

  const Overlap = (z, c) => Math.min(z.x + z.w / 2, c.x1) - Math.max(z.x - z.w / 2, c.x0);

  // ① 剧本里的放置点压在掩体上：掩体带专职挡人，落在它足迹里的东西会被吞掉。
  //    2026-08-06 的水桶事故就是 c1_water 的放桶点（木料堆）压着 hayB 草垛。
  for (const d of DROP_ZONES) {
    if (d.scene !== sceneKey) continue;
    for (const c of covers) {
      const overlap = Overlap(d.zone, c);
      if (overlap > 0.4) {
        problems.push(`${sceneKey}/${d.beat}: 放东西的地方「${d.zone.label || "?"}」压在掩体 ${c.id} 上 `
          + `${overlap.toFixed(1)}m——掩体带专职挡人，东西会被吞掉`
          + `（Core 的 DropSpot 兜得住，但摆位本身就该错开）`);
      }
    }
  }

  // 其余区域坐在掩体上多半是有意的（潜行观察点就以掩体命名），只记一笔
  for (const [zk, z] of Object.entries(scene.zones || {})) {
    if ((z.level || "surface") !== "surface") continue;
    if (DROP_ZONES.some((d) => d.zone === z)) continue;
    for (const c of covers) {
      if (Overlap(z, c) > 0.4) notes.push(`${sceneKey}: 区域「${z.label || zk}」坐在掩体 ${c.id} 上`);
    }
  }

  // ② 挡人的矮物件必须真的矮：高过腰的东西落到人前面会把角色整个吞掉
  for (const r of rows) {
    if (r.z === null || r.z < NEAR_CLUTTER[0]) continue;
    const hM = r.h ?? (r.kind === "haystack" ? r.w : null);
    if (hM !== null && hM > 1.2) {
      problems.push(`${sceneKey}/${r.id}: z=${r.z}（挡人区间）但高 ${hM}m > 1.2m，会把演员吞掉`);
    }
  }

  // ③ 翻越物与掩体撞车：翻越是"贴上去自动翻过去"，掩体是"躲在后面"，
  //    两个判定叠在同一段 x 上，玩家会莫名其妙被弹开
  for (const v of scene.vaults || []) {
    for (const c of covers) {
      const overlap = Math.min(v.x + (v.w || 1) / 2, c.x1) - Math.max(v.x - (v.w || 1) / 2, c.x0);
      if (overlap > 0.2) problems.push(`${sceneKey}: 翻越物 x=${v.x} 与掩体 ${c.id} 重叠 ${overlap.toFixed(1)}m`);
    }
  }

  // ④ 高掩体的"两档交替"是不是名存实亡：哈希对一批相似短 id 可能全落一边，
  //    于是一整排草垛其实同深度，本想要的层次感一直没出现
  const tallRows = rows.filter((r) => r.group === "cover" && r.z !== null && r.z < 0);
  const bands = new Set(tallRows.map((r) => r.band));
  if (tallRows.length >= 4 && bands.size === 1) {
    notes.push(`${sceneKey}: ${tallRows.length} 个高掩体全落在 ${[...bands][0]} 带`
      + `——coverBands.tallPick 想要的两档层次没生效（哈希对这批相似 id 全落同一边）`);
  }

  // ⑤ 同一条行走线上两个物体撞在一起（贴图必然穿插）
  const line = rows.filter((r) => r.z !== null && Math.abs(r.z - BAND.walk) < 0.01 && r.level === "surface");
  for (let i = 0; i < line.length; i += 1) {
    for (let j = i + 1; j < line.length; j += 1) {
      if (Math.abs(line[i].x - line[j].x) < 0.6) {
        problems.push(`${sceneKey}: ${line[i].id} 与 ${line[j].id} 都在行走线上且相距 `
          + `${Math.abs(line[i].x - line[j].x).toFixed(1)}m，贴图会穿插`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
const all = [];
for (const [key, scene] of Object.entries(SCENES)) {
  if (only.length && !only.includes(key)) continue;
  const rows = Rows(key, scene);
  Audit(key, scene, rows);
  all.push({ key, scene, rows });
}

if (asJson) {
  console.log(JSON.stringify({ rows: all.flatMap((a) => a.rows), problems, notes }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

const Pad = (s, n) => {
  // 中日韩字符占两格，按显示宽度补
  const str = String(s ?? "");
  let w = 0;
  for (const ch of str) w += /[⺀-￯]/.test(ch) ? 2 : 1;
  return str + " ".repeat(Math.max(0, n - w));
};

for (const { key, scene, rows } of quiet ? [] : all) {
  console.log(`\n━━ ${key}　${scene.label || ""}　长 ${scene.length}m　`
    + `地表 [${scene.walk.surface || "—"}]　地下 [${scene.walk.under || "—"}]`);
  console.log(`   ${Pad("id", 16)}${Pad("kind", 16)}${Pad("x", 8)}${Pad("层", 8)}`
    + `${Pad("深度带", 12)}${Pad("画笔", 22)}${Pad("贴图", 14)}旗标门 / 备注`);
  for (const r of rows) {
    const mark = r.group === "cover" ? "▨" : "·";
    console.log(`${mark}  ${Pad(r.id, 16)}${Pad(r.kind, 16)}${Pad(r.x, 8)}${Pad(r.level, 8)}`
      + `${Pad(`${r.band}(${r.z ?? "—"})`, 12)}${Pad(r.art, 22)}${Pad(r.sprite, 14)}`
      + `${r.gate}${r.gate && r.name ? " " : ""}${r.name !== r.id ? r.name : ""}`);
  }
}

const count = all.reduce((n, a) => n + a.rows.length, 0);
if (!quiet) {
  console.log(`\n标尺 ${PPM}px/米；▨ = 掩体（能躲）· = 道具。`
    + `贴图列 = 烘焙画布像素 @超采样倍率。`);
  console.log(`共 ${count} 个物体。`);
  if (notes.length) {
    console.log(`\n· ${notes.length} 条备注（多半是有意的，看一眼确认）：`);
    for (const n of notes) console.log("  - " + n);
  }
}
if (problems.length) {
  console.log(`\n⚠ ${problems.length} 处会出事：`);
  for (const p of problems) console.log("  · " + p);
  process.exit(1);
}
console.log(quiet
  ? `  ✓ 场景数据体检通过（${count} 个物体）`
  : "\n✓ 交叉校验通过：放置点没压掩体 / 高物件没挡人 / 翻越没撞掩体 / 行走线没穿插");
