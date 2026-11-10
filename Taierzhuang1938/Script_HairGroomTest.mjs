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
import { HAIR_SHADING } from './Data_Tuning_Hair.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HAIR = path.join(here, 'Hair');
let failures = 0, checks = 0;
const Check = (ok, message) => { checks++; if (!ok) { failures++; console.error(`  ✗ ${message}`); } };
const ARRAY_TYPES = { Float32Array, Uint16Array, Uint32Array, Uint8Array, Int8Array };

const styles = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairStyles.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairGrooms.json'), 'utf8'));
const heads = JSON.parse(fs.readFileSync(path.join(HAIR, 'Heads', 'Data_HairHeads.json'), 'utf8')).heads;
const references = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairReferences.json'), 'utf8'));
const referenceMasks = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairReferenceMasks.json'), 'utf8'));
const referenceText = fs.readFileSync(path.join(HAIR, 'Data_HairReferences.json'), 'utf8').replace(/\r\n/g, '\n');
Check(referenceMasks.definitionSha256 === createHash('sha256').update(referenceText).digest('hex'), '参考覆盖图基于当前五官校准与配方');
Check(referenceMasks.atlasSha256 === createHash('sha256').update(fs.readFileSync(path.join(HAIR, referenceMasks.atlas))).digest('hex'), '参考覆盖图集校验和一致');
Check(referenceMasks.luminanceAtlasSha256 === createHash('sha256').update(fs.readFileSync(path.join(HAIR, referenceMasks.luminanceAtlas))).digest('hex'), '胡须原图亮度图集校验和一致');
const referenceTiles = Object.values(referenceMasks.looks).map(look=>look.tile);
Check(referenceTiles.every(([x,y,w,h])=>x>=0 && y>=0 && w>0 && h>0 && x+w<=1.00001 && y+h<=1.00001), '所有人物覆盖图均落在扩展图集内');
Check(referenceTiles.every((a,i)=>referenceTiles.slice(i+1).every(b=>a[0]+a[2]<=b[0]+1e-6 || b[0]+b[2]<=a[0]+1e-6 || a[1]+a[3]<=b[1]+1e-6 || b[1]+b[3]<=a[1]+1e-6)), '人物覆盖区域互不重叠');
const ReferenceMeta = (key) => {
  const recipe = references.looks[key];
  return recipe && {look:key, source:recipe.source, sha256:recipe.sha256, version:references.version,
    recipeSha256:createHash('sha256').update(JSON.stringify(recipe)).digest('hex')};
};

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
  if (entry.referenceLook || entry.model) {
    const meta = ReferenceMeta(entry.referenceLook);
    Check(entry.referenceLook === (entry.labHead || entry.head) && !!meta, `${entry.id}：使用本人参考配方`);
    if (meta) {
      Check(/^[a-f0-9]{64}$/.test(meta.sha256) && !path.isAbsolute(meta.source) && !meta.source.includes('..'), `${entry.id}：参考图路径与 SHA-256 完整`);
      const look = references.looks[entry.referenceLook];
      Check(!!look.beard.referenceParts && !!referenceMasks.looks[entry.referenceLook], `${entry.id}：使用本人细须覆盖与发根分布`);
      Check(/^[a-f0-9]{64}$/.test(look.baldSha256), `${entry.id}：剃净参考也记录来源哈希`);
      const marks = look.landmarks;
      Check(marks.glabella[1] > marks.subnasale[1] && marks.subnasale[1] > marks.stomion[1] && marks.stomion[1] > marks.menton[1], `${entry.id}：校准的眉间、鼻下、口裂、下巴次序正确`);
      if (look.beard.proportionalRegions) {
        const mask = referenceMasks.looks[entry.referenceLook], ref = look.registration.reference;
        const [left,top,right,bottom] = mask.crop, size = mask.grid.size;
        const x = Math.round((ref.centerX-left)/(right-left)*(size-1));
        const y = Math.round((ref.mouthY+(ref.chinY-ref.mouthY)*.75-top)/(bottom-top)*(size-1));
        const part = Buffer.from(mask.grid.parts, 'base64')[y*size+x]-1;
        Check(referenceMasks.parts[part] === 'chin', `${entry.id}：较远取景的下巴仍归下巴胡，唇下框不会吞掉下巴`);
      }
    }
  }
}
Check(manifest.grooms.length === entries.length && ids.size === entries.length, `清单 ${manifest.grooms.length} 套 = 造型表 ${entries.length} 套，编号唯一`);
const gameByFile = new Map((styles.gameGrooms || []).map(entry => [`./Hair/Grooms/Groom_${entry.id}.bin`, entry]));
for (const def of Object.values(XBOT_CHARACTERS)) if (def.groom) {
  Check(fs.existsSync(path.join(here, def.groom)), `${def.name} 游戏头发文件存在`);
  Check(gameByFile.get(def.groom)?.model === def.file.replace(/^\.\//, ''), `${def.name} 头发按本人游戏模型绑定`);
}
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
  const entry = entries.find((e) => e.id === g.id);
  if (entry.referenceLook) {
    const expected = JSON.stringify(ReferenceMeta(entry.referenceLook));
    Check(JSON.stringify(header.reference) === expected && JSON.stringify(g.reference) === expected, `${g.id}：二进制与清单均基于当前个人参考和配方（修改后必须重烘）`);
    const look = references.looks[entry.referenceLook];
    if (look.beard.referenceLuminance) Check(header.beard?.render.referenceLuminance === true
      && header.beard.referenceMask?.luminanceAtlasSha256 === referenceMasks.luminanceAtlasSha256,
      `${g.id}：使用当前本人胡须的原图亮度`);
    if (entry.beard) {
      const mask = header.beard?.referenceMask;
      Check(mask?.look === entry.referenceLook && mask?.atlasSha256 === referenceMasks.atlasSha256
        && mask?.sourceSha256 === look.sha256 && mask?.baldSha256 === look.baldSha256, `${g.id}：使用当前本人的原图覆盖图集`);
      const uv = sec('beardStubbleUv'), pos = sec('beardStubblePos');
      Check(!!uv && !!pos && uv.length === pos.length / 3 * 2, `${g.id}：细须投影 UV 与网格匹配`);
      const tile = referenceMasks.looks[entry.referenceLook].tile;
      Check(!!uv && uv.every((value, index) => {
        const axis = index % 2, unit = value / 65535;
        return unit >= tile[axis] - .0001 && unit <= tile[axis] + tile[axis + 2] + .0001;
      }), `${g.id}：UV 始终在本人的图集区域内`);
    } else Check(!header.beard && look.beard.enabled === false, `${g.id}：净面参考不生成胡须或胡茬`);
    const scalpUv = sec('hairScalpUv'), scalpPos = sec('hairScalpPos');
    Check(header.hair?.referenceScalp?.look === entry.referenceLook && header.hair?.referenceScalp?.atlasSha256 === referenceMasks.atlasSha256,
      `${g.id}：额前发根使用本人的参考覆盖图`);
    const scalpReference = header.hair?.referenceScalp;
    Check(JSON.stringify(scalpReference?.frontFadeDegrees) === JSON.stringify(HAIR_SHADING.referenceFrontFadeDegrees),
      `${g.id}：几何发际线与运行时侧面投影过渡一致（调参后必须重烘）`);
    Check(scalpReference?.projection?.rows.length === 6 && scalpReference?.normalizationLuminance === referenceMasks.looks[entry.referenceLook].normalizationLuminance,
      `${g.id}：实际发丝使用当前的参考投影与浓密头发亮度基准`);
    Check(!!scalpUv && !!scalpPos && scalpUv.length === scalpPos.length / 3 * 2, `${g.id}：额前投影 UV 与头皮几何匹配`);
    Check(header.portrait?.height > .15 && header.portrait?.height < .35, `${g.id}：单人观察按校准后的完整头部取景`);
  }
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
    if (H.shell.kind === 'hull') {
      const raw = sec('hairShellPos'), indices = sec('hairShellIndex'), q = header.sections.hairShellPos.quant;
      const points = Array.from(raw, (value, i) => q.min[i % 3] + value / 65535 * (q.max[i % 3] - q.min[i % 3]));
      const [x, top, z] = heads[entry.head].top;
      let surfaceY = -Infinity;
      for (let i = 0; i < indices.length; i += 3) {
        const [a,b,c] = Array.from(indices.slice(i,i+3),index=>points.slice(index*3,index*3+3));
        const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
        if(Math.abs(d)<1e-12)continue;
        const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d;
        const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
        if(u>=-1e-5 && v>=-1e-5 && u+v<=1.00001)surfaceY=Math.max(surfaceY,u*a[1]+v*b[1]+(1-u-v)*c[1]);
      }
      Check(surfaceY > top + .0002, `${g.id}：远档头顶有真实几何覆盖头皮（${surfaceY-top} m）`);
    }
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
