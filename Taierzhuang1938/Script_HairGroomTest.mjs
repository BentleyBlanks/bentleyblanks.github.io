// 头发资产门禁（docs/Data_HairSystem.md §8），纯 Node：
//   1. 造型表 Hair/Data_HairStyles.json 的每套 grooms 都出了 .bin，清单 Hair/Data_HairGrooms.json 与它一一对应；
//   2. 每个 .bin 能按运行时同一口径解开：段落齐全、长度对、导向发丝点有限、渲染发丝的三根导向下标不越界、重心权重和为 1；
//   3. 发片 / 头发壳 / 胡茬的索引不越界，消光体素尺寸与文件头一致；
//   4. 头部胸像 GLB 与关键点存在、发片图集存在；测试场摆的每一套都在清单里。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { HAIR_RANGE_ROWS } from './Data_HairRange.mjs';
import { XBOT_CHARACTERS } from './Data_XBotCharacters.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HAIR = path.join(here, 'Hair');
let failures = 0, checks = 0;
const Check = (ok, message) => { checks++; if (!ok) { failures++; console.error(`  ✗ ${message}`); } };
const ARRAY_TYPES = { Float32Array, Uint16Array, Uint32Array, Uint8Array, Int8Array };

const styles = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairStyles.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairGrooms.json'), 'utf8'));
const heads = JSON.parse(fs.readFileSync(path.join(HAIR, 'Heads', 'Data_HairHeads.json'), 'utf8')).heads;

Check(fs.existsSync(path.join(HAIR, manifest.atlas.file)), `发片图集 ${manifest.atlas.file} 存在`);
for (const [key, h] of Object.entries(manifest.heads)) {
  Check(fs.existsSync(path.join(HAIR, h.file)), `胸像 ${h.file} 存在`);
  Check(!!heads[key] && Number.isFinite(heads[key].menton?.[1]) && heads[key].top[1] > heads[key].menton[1], `${key} 关键点齐全（头顶高于下巴）`);
}
const ids = new Set(manifest.grooms.map((g) => g.id));
const entries = [...styles.grooms, ...(styles.gameGrooms || [])];
for (const entry of entries) {
  Check(ids.has(entry.id), `${entry.id}：清单里有（造型表改了要重跑 _import/Script_HairGroomBuild.mjs）`);
  Check(!entry.hair || !!styles.hair[entry.hair], `${entry.id}：发型 ${entry.hair} 在造型表里`);
  Check(!entry.beard || !!styles.beard[entry.beard], `${entry.id}：胡子 ${entry.beard} 在造型表里`);
  Check(!!heads[entry.head], `${entry.id}：头 ${entry.head} 有关键点`);
}
Check(manifest.grooms.length === entries.length && ids.size === entries.length, `清单 ${manifest.grooms.length} 套 = 造型表 ${entries.length} 套，编号唯一`);
for (const def of Object.values(XBOT_CHARACTERS)) if (def.groom) Check(fs.existsSync(path.join(here, def.groom)), `${def.name} 游戏头发文件存在`);
for (const row of HAIR_RANGE_ROWS) for (const item of row.items) Check(ids.has(item.groom), `测试场 ${row.id} 排的 ${item.groom} 在清单里`);

function Open(file) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  Check(buf.toString('ascii', 0, 4) === 'TXHR', `${path.basename(file)}：文件头 TXHR`);
  const jsonLength = buf.readUInt32LE(8);
  const header = JSON.parse(buf.toString('utf8', 12, 12 + jsonLength));
  const base = 12 + jsonLength;
  Check(base % 4 === 0, `${path.basename(file)}：数据段 4 字节对齐`);
  const sec = (name) => { const m = header.sections[name]; return m ? new ARRAY_TYPES[m.type](ab, base + m.offset, m.count) : null; };
  return { header, sec, bytes: buf.length };
}
function CheckIndex(name, index, vertexCount) {
  let max = 0; for (const v of index) if (v > max) max = v;
  Check(index.length % 3 === 0 && max < vertexCount, `${name}：索引 ${index.length} 个、最大 ${max} < 顶点 ${vertexCount}`);
}

let totalBytes = 0;
for (const g of manifest.grooms) {
  const file = path.join(HAIR, g.file);
  if (!fs.existsSync(file)) { Check(false, `${g.file} 存在`); continue; }
  const { header, sec, bytes } = Open(file);
  totalBytes += bytes;
  Check(bytes === g.bytes, `${g.id}：清单记的大小与文件一致（${bytes}）`);
  Check(header.id === g.id && header.head === g.head, `${g.id}：文件头 id / head 对得上`);
  if (header.model) {
    Check(fs.existsSync(path.join(here, header.model)), `${g.id} 游戏人物存在`);
    Check(header.modelSha256 === createHash('sha256').update(fs.readFileSync(path.join(here, header.model))).digest('hex'), `${g.id} 基于当前人物与帽子（模型更新后要重烘）`);
    Check(header.bone === 'Head' && header.attach?.length === 16 && header.attach.every(Number.isFinite), `${g.id} 头骨挂接矩阵有效`);
    Check(header.icpErrorM < 0.006, `${g.id} 头部匹配误差 < 6 mm（${(header.icpErrorM * 1000).toFixed(2)}）`);
  }
  if (header.hair) {
    const H = header.hair, K = H.points, G = H.guides, S = H.strands;
    const guides = sec('hairGuides');
    Check(guides && guides.length === G * K * 4, `${g.id}：导向发丝 ${G} × ${K} 点`);
    let finite = true; for (const v of guides) if (!Number.isFinite(v)) { finite = false; break; }
    Check(finite, `${g.id}：导向发丝坐标都是有限数`);
    const sg = sec('hairStrandGuides'), sb = sec('hairStrandBary'), ss = sec('hairStrandSeed');
    Check(sg.length === S * 3 && sb.length === S * 2 && ss.length === S * 2, `${g.id}：渲染发丝 ${S} 根的插值数据长度对`);
    let maxId = 0, badW = 0;
    for (let i = 0; i < S; i++) {
      maxId = Math.max(maxId, sg[3 * i], sg[3 * i + 1], sg[3 * i + 2]);
      const w0 = (sb[2 * i] / 65535) * 2 - 0.5, w1 = (sb[2 * i + 1] / 65535) * 2 - 0.5, w2 = 1 - w0 - w1;
      if (w0 < -0.51 || w1 < -0.51 || w2 < -0.6 || w2 > 1.6) badW++;
    }
    Check(maxId < G, `${g.id}：插值下标最大 ${maxId} < 导向发丝 ${G}`);
    Check(badW === 0, `${g.id}：重心权重都在 [-0.5, 1.5] 内（坏 ${badW} 根）`);
    const [nx, ny, nz] = H.density.res;
    Check(sec('hairDensity').length === nx * ny * nz && H.density.voxel > 0, `${g.id}：消光体素 ${nx}×${ny}×${nz}`);
    for (const part of ['hairCard', 'hairShell', 'hairScalp']) {
      const pos = sec(`${part}Pos`), idx = sec(`${part}Index`);
      Check(!!pos && !!idx && pos.length > 0, `${g.id}：${part} 有几何`);
      if (pos && idx) CheckIndex(`${g.id} ${part}`, idx, pos.length / 3);
    }
  }
  if (header.beard) {
    const pos = sec('beardCardPos'), idx = sec('beardCardIndex');
    if (header.beard.cards > 0) { Check(!!pos && pos.length > 0, `${g.id}：胡子发片有几何`); if (pos) CheckIndex(`${g.id} beardCard`, idx, pos.length / 3); }
    const st = sec('beardStubblePos');
    if (st) CheckIndex(`${g.id} beardStubble`, sec('beardStubbleIndex'), st.length / 3);
    Check(header.beard.cards > 0 || !!st, `${g.id}：胡子至少有发片或胡茬`);
  }
}
console.log(`[hair] 头发资产：${checks - failures}/${checks} 条过（${manifest.grooms.length} 套，共 ${(totalBytes / 1e6).toFixed(1)} MB）`);
if (failures) process.exit(1);
