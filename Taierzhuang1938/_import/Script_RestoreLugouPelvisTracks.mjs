// 把卢沟桥十套角色 GLB 里丢掉的骨盆位移轨道补回来（离线资产修复，不是运行时补丁）。
//
// ===========================================================================
// 【为什么会有这个脚本 —— 2026-08-29 的发布阻塞项】
//
// 清单 v3 那批重烘（master 的 dddd54d9 / 80fac555）在 Biped 根骨上方插了一根不
// 蒙皮的 `GroundRoot`，把「就地化 + 贴地」整体挪到那根骨头上，同时把贴地补偿从
// v1 的双向 `targetGroundZ - currentGroundZ` 改成只抬不放的 `max(0, -groundZ)`。
// 结果是：**根骨（`Bip00x Pelvis`）自己的位移轨道没能进 GLB** —— 十六条 clip 的
// 骨盆位移全是常量（等于静止姿的高度），而大腿、锁骨这些非根骨的位移轨道都在。
// 十六条 clip 于是全部把人钉在站立高度：躺的、跪的、坐的一律站着飘在空中。
//
// 而「只抬不放」这一条让它**静默通过**了自己的审计：人悬在空中永远不会陷进地里，
// 所以清单里 15/16 条 clip 的 maxGroundCorrectionMeters 是 0.0000、
// maxGroundPenetrationMeters 全是 0 —— 那条审计量的是「有没有陷进地里」，
// 不是「姿势对不对」。这就是它漏过去的确切原因。
//
// 【为什么是修复而不是重烘】完整重烘要走 3ds Max 批处理桥：两份 `.max` 绑定场景
// 加 16 个 `.bip`（见 Script_BakeLugouCharacters.ps1）。这台机器上 `.max`/`.bip`
// 源文件和中间 FBX（%LOCALAPPDATA%\Temp\LugouCharacterFbx）都不在，全盘扫过没有，
// 所以离线重跑烘焙这条路走不通。但**丢的那条轨道本身还在仓库里**：v1 那批 GLB
// （commit 3d1f879b）逐条 clip 都带着骨盆位移。这里做的是把它搬回来，
// 其余（阵营正确的动作旋转、胶囊命中体、NormalDepth LOD、四权重蒙皮、贴图）
// 一个字节都不动 —— 网格与贴图的二进制段原样保留，新数据只往 BIN 尾部追加。
//
// 【两步，缺一不可】
//   1. **搬轨道**：v1 的骨盆位移按目标 clip 的关键帧时间重采样写回。骨盆在 v1 挂
//      在骨架节点下、在 v3 挂在 GroundRoot 下，而 GroundRoot 的静止变换是单位阵
//      （脚本里逐个断言），所以两边父空间等价，数值可以直接搬。
//   2. **对接触面重新标定**：v3 把日军动作换成了日军自己的 canonical rig，
//      同一条 clip 的**旋转**变了，于是 v1 那条骨盆高度在新旋转下会让日军整体
//      沉进地里 7–14 cm（实测 Ija01 站姿据枪最低顶点 −0.139 m，v1 是 −0.062）。
//      所以每条 clip 再给 GroundRoot 一个常数，把这条 clip 的接触深度对回 v1
//      的接触深度（取逐帧差的中位数，抗单帧离群）。常数是**每条 clip 一个**，
//      不逐帧改，clip 内部的起伏仍然是作者摆的那份。
//
// 【为什么不能用「把人往下贴到地面」代替第 1 步】试过：拿变形网格最低点做双向
// 贴地，匍匐那条 clip 的头会落在 0.47–0.68 m（要求 0.10–0.50）。源动作里躺/坐的
// 身体本来就允许小幅陷进接触面（膝、靴尖），拿绝对最低顶点当地面等于把人整个
// 抬起来。姿态高度只能来自作者摆的那条根骨轨道，不能由贴地反推。
// ===========================================================================
//
// 用法（在仓库任意位置）：
//   node Taierzhuang1938/_import/Script_RestoreLugouPelvisTracks.mjs [--donor <git ref>] [--dry-run]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BuildSkin, LoadGlb, MinSkinnedY, PoseScene, ReadAccessor, SerializeGlb,
} from "./Script_LugouGlbPose.mjs";
import { PythonJson } from "./Script_LugouManifestJson.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const repoDir = path.resolve(projectDir, "..");
const characterDir = path.join(projectDir, "Model", "Character");
const manifestPath = path.join(characterDir, "Data_LugouCharacterManifest.json");

const DEFAULT_DONOR = "3d1f879b";
const GROUND_ROOT = "GroundRoot";
// 逐帧算蒙皮最低点不便宜（每帧约 6500 顶点 × 4 权重）。源 clip 最长 161 帧，
// 33 帧的均匀取样已经能抓住接触极值（帧数最少的 CrouchFireAlt 只有 9 帧）。
const CONTACT_SAMPLES = 33;

function ParseArgs() {
  const argv = process.argv.slice(2);
  const options = { donor: DEFAULT_DONOR, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--donor") { options.donor = argv[i + 1]; i += 1; }
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return options;
}

function ReadDonor(ref, fileName) {
  return execFileSync(
    "git",
    ["-C", repoDir, "show", `${ref}:Taierzhuang1938/Model/Character/${fileName}`],
    { maxBuffer: 256 * 1024 * 1024, encoding: "buffer" },
  );
}

function TranslationSampler(glb, animation, nodeIndex) {
  const channel = animation.channels.find(
    (entry) => entry.target.node === nodeIndex && entry.target.path === "translation",
  );
  if (!channel) return null;
  return { channel, sampler: animation.samplers[channel.sampler] };
}

/** 按目标 clip 的关键帧时间去捐赠资产上取样（尊重 STEP/LINEAR）。 */
function Resample(times, donorTimes, donorValues, interpolation) {
  const out = new Float32Array(times.length * 3);
  for (let k = 0; k < times.length; k += 1) {
    const time = times[k];
    let i = 0;
    while (i < donorTimes.length - 1 && donorTimes[i + 1] < time) i += 1;
    const j = Math.min(i + 1, donorTimes.length - 1);
    const span = donorTimes[j] - donorTimes[i];
    const alpha = interpolation === "STEP" || span <= 0
      ? 0
      : Math.min(1, Math.max(0, (time - donorTimes[i]) / span));
    for (let c = 0; c < 3; c += 1) {
      out[k * 3 + c] = donorValues[i * 3 + c] * (1 - alpha) + donorValues[j * 3 + c] * alpha;
    }
  }
  return out;
}

/** 追加一段 VEC3/FLOAT 数据，返回 { accessor, byteOffset }。 */
function AppendVec3Accessor(json, chunks, state, values) {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  const padding = (4 - (state.offset % 4)) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding, 0)); state.offset += padding; }
  const byteOffset = state.offset;
  chunks.push(bytes);
  state.offset += bytes.length;
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  json.accessors.push({
    bufferView: json.bufferViews.length - 1,
    componentType: 5126,
    count: values.length / 3,
    type: "VEC3",
  });
  return { accessor: json.accessors.length - 1, byteOffset };
}

function SampleTimes(duration, frames) {
  const count = Math.max(2, Math.min(CONTACT_SAMPLES, frames || CONTACT_SAMPLES));
  return Array.from({ length: count }, (unused, i) => (duration * i) / (count - 1));
}

/** 逐帧的变形网格最低世界 Y。 */
function ContactTrace(scene, parts, animationIndex, times) {
  return times.map((time) => {
    scene.Apply(animationIndex, time);
    return MinSkinnedY(scene, parts);
  });
}

function Median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// 清单要按 Python 的写法写回去：序列化规则在 Script_LugouManifestJson.mjs（共享），
// 写盘前 Main 里有往返自检守着。

function Main() {
  const options = ParseArgs();
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  // 往返自检：先把**没动过的**清单按 Python 的规则序列化一遍，与磁盘上的原文逐字节比。
  // 对不上就说明 PythonJson 又和 json.dumps 走岔了，这时候写盘只会造出满屏假 diff。
  if (PythonJson(manifest) !== manifestText.replace(/\r\n/g, "\n")) {
    throw new Error("PythonJson round-trip does not reproduce the manifest byte for byte");
  }
  const report = [];

  for (const record of manifest.models) {
    const fileName = path.basename(record.url);
    const targetPath = path.join(characterDir, fileName);
    const target = LoadGlb(targetPath);
    const donor = LoadGlb(ReadDonor(options.donor, fileName));

    const pelvisName = record.boneRoles.pelvis;
    const targetNodes = target.json.nodes;
    const pelvisIndex = targetNodes.findIndex((node) => node.name === pelvisName);
    const groundIndex = targetNodes.findIndex((node) => node.name === GROUND_ROOT);
    if (pelvisIndex < 0) throw new Error(`${fileName}: pelvis node ${pelvisName} missing`);
    if (groundIndex < 0) throw new Error(`${fileName}: ${GROUND_ROOT} missing`);
    if (targetNodes.findIndex((node) => (node.children || []).includes(pelvisIndex)) !== groundIndex) {
      throw new Error(`${fileName}: pelvis is not parented to ${GROUND_ROOT}`);
    }
    // v1 的骨盆挂在骨架对象节点下，v3 挂在 GroundRoot 下。两边的父空间只有在
    // GroundRoot 静止变换≈单位阵时才等价 —— 不成立就别搬，宁可报错。
    const groundRest = targetNodes[groundIndex];
    const groundT = groundRest.translation || [0, 0, 0];
    const groundR = groundRest.rotation || [0, 0, 0, 1];
    if (Math.hypot(...groundT) > 1e-3 || Math.hypot(groundR[0], groundR[1], groundR[2]) > 1e-5) {
      throw new Error(`${fileName}: ${GROUND_ROOT} rest transform is not identity`);
    }
    const donorPelvis = donor.json.nodes.findIndex((node) => /pelvis$/i.test(node.name || ""));
    if (donorPelvis < 0) throw new Error(`${fileName}: donor has no pelvis node`);

    const json = target.json;
    const chunks = [target.bin];
    const state = { offset: target.bin.length };
    const groundWrites = [];
    let restored = 0;
    let alreadyLive = 0;

    // ── 第一步：搬骨盆轨道，GroundRoot 先清成静止值 ─────────────────────────
    for (const animation of json.animations) {
      const donorAnimation = donor.json.animations.find((entry) => entry.name === animation.name);
      if (!donorAnimation) throw new Error(`${fileName}: donor lacks clip ${animation.name}`);
      const targetTrack = TranslationSampler(target, animation, pelvisIndex);
      const donorTrack = TranslationSampler(donor, donorAnimation, donorPelvis);
      if (!targetTrack || !donorTrack) {
        throw new Error(`${fileName}/${animation.name}: no pelvis translation channel`);
      }
      const times = ReadAccessor(target, targetTrack.sampler.input).data;
      const donorTimes = ReadAccessor(donor, donorTrack.sampler.input).data;
      const donorValues = ReadAccessor(donor, donorTrack.sampler.output).data;
      if (Math.abs(times[times.length - 1] - donorTimes[donorTimes.length - 1]) > 1e-3) {
        throw new Error(`${fileName}/${animation.name}: donor clip length differs`);
      }
      const existing = ReadAccessor(target, targetTrack.sampler.output).data;
      let span = 0;
      for (let c = 0; c < 3; c += 1) {
        let low = Infinity;
        let high = -Infinity;
        for (let k = 0; k < existing.length / 3; k += 1) {
          low = Math.min(low, existing[k * 3 + c]);
          high = Math.max(high, existing[k * 3 + c]);
        }
        span = Math.max(span, high - low);
      }
      // 幂等闸：轨道还活着就不要再搬一次（会叠加成两倍位移）。
      if (span > 1e-3) { alreadyLive += 1; continue; }

      const values = Resample(times, donorTimes, donorValues, donorTrack.sampler.interpolation || "LINEAR");
      targetTrack.sampler.output = AppendVec3Accessor(json, chunks, state, values).accessor;
      restored += 1;

      // GroundRoot 上原来那点贴地补偿是**对着坏姿势**算出来的（十六条里只有一条
      // 非零，6.5 mm），骨盆轨道补回来之后它已经没有意义。先清成静止值，
      // 第二步再按接触面标定重新写进去。
      const groundTrack = TranslationSampler(target, animation, groundIndex);
      if (!groundTrack) throw new Error(`${fileName}/${animation.name}: ${GROUND_ROOT} has no translation channel`);
      const neutral = new Float32Array(times.length * 3);
      for (let k = 0; k < times.length; k += 1) {
        neutral[k * 3] = groundT[0];
        neutral[k * 3 + 1] = groundT[1];
        neutral[k * 3 + 2] = groundT[2];
      }
      const appended = AppendVec3Accessor(json, chunks, state, neutral);
      groundTrack.sampler.output = appended.accessor;
      groundWrites.push({ clip: animation.name, byteOffset: appended.byteOffset, count: times.length });
    }

    if (!restored) {
      report.push(`${record.id}: 跳过（${alreadyLive} 条 clip 的骨盆轨道已经是活的）`);
      continue;
    }

    const bin = Buffer.concat(chunks);
    json.buffers[0].byteLength = bin.length;
    const output = SerializeGlb(json, bin);

    // ── 第二步：逐 clip 把接触深度对回捐赠资产 ─────────────────────────────
    const donorScene = new PoseScene(donor);
    const donorParts = BuildSkin(donor);
    const staged = LoadGlb(output);
    const stagedScene = new PoseScene(staged);
    const stagedParts = BuildSkin(staged);
    // GroundRoot 的局部 Y 换算到世界 Y 的系数：骨架对象带 0.01 缩放和一次绕 Y 的
    // 旋转，绕 Y 旋转不动 Y 分量，所以只差一个统一缩放。取父节点世界矩阵第 1 列的
    // Y 分量，别把 0.01 写死。
    stagedScene.Apply(0, 0);
    const groundParent = stagedScene.parent[groundIndex];
    const localToWorldY = stagedScene.world[groundParent][5];
    if (!Number.isFinite(localToWorldY) || Math.abs(localToWorldY) < 1e-6) {
      throw new Error(`${fileName}: cannot map ${GROUND_ROOT} local Y to world Y`);
    }
    const shifts = {};
    for (const write of groundWrites) {
      const index = stagedScene.AnimationIndex(write.clip);
      const donorIndex = donorScene.AnimationIndex(write.clip);
      const duration = stagedScene.animations[index].duration;
      const frames = record.animationAudit[write.clip]?.sourceFrames;
      const times = SampleTimes(duration, frames);
      const stagedTrace = ContactTrace(stagedScene, stagedParts, index, times);
      const donorTrace = ContactTrace(donorScene, donorParts, donorIndex, times);
      const shift = Median(donorTrace.map((value, i) => value - stagedTrace[i]));
      shifts[write.clip] = shift;
      const local = shift / localToWorldY;
      // 直接改刚追加的那段字节：长度不变，不必再拼一次文件。
      const binHeader = 20 + output.readUInt32LE(12) + 8;
      for (let k = 0; k < write.count; k += 1) {
        const at = binHeader + write.byteOffset + k * 12 + 4;
        output.writeFloatLE(groundT[1] + local, at);
      }
    }

    if (!options.dryRun) fs.writeFileSync(targetPath, output);

    // ── 审计：逐 clip 量骨盆高度与贴地深度，写回清单 ───────────────────────
    const finalGlb = LoadGlb(output);
    const finalScene = new PoseScene(finalGlb);
    const finalParts = BuildSkin(finalGlb);
    const finalPelvis = finalScene.NodeIndex(pelvisName);
    let low = Infinity;
    let high = -Infinity;
    let deepest = 0;
    for (let a = 0; a < finalScene.animations.length; a += 1) {
      const animation = finalScene.animations[a];
      const times = SampleTimes(animation.duration, record.animationAudit[animation.name]?.sourceFrames);
      let clipLow = Infinity;
      let clipHigh = -Infinity;
      let contact = Infinity;
      for (const time of times) {
        finalScene.Apply(a, time);
        const y = finalScene.WorldY(finalPelvis);
        clipLow = Math.min(clipLow, y);
        clipHigh = Math.max(clipHigh, y);
        contact = Math.min(contact, MinSkinnedY(finalScene, finalParts));
      }
      const audit = record.animationAudit[animation.name];
      audit.pelvisHeightMeters = [Number(clipLow.toFixed(6)), Number(clipHigh.toFixed(6))];
      audit.maxGroundPenetrationMeters = Number(Math.max(0, -contact).toFixed(6));
      audit.maxGroundCorrectionMeters = Number((shifts[animation.name] || 0).toFixed(6));
      low = Math.min(low, clipLow);
      high = Math.max(high, clipHigh);
      deepest = Math.max(deepest, audit.maxGroundPenetrationMeters);
      record.validation.maxGroundPenetrationMeters[animation.name] = audit.maxGroundPenetrationMeters;
    }
    record.pelvisHeightSpreadMeters = Number((high - low).toFixed(6));
    record.pelvisTrackSource = options.donor;
    record.bytes = output.length;
    report.push(
      `${record.id}: 补回 ${restored} 条 clip，骨盆 ${low.toFixed(3)}–${high.toFixed(3)} m`
      + `（跨 clip 落差 ${record.pelvisHeightSpreadMeters.toFixed(3)}），`
      + `接触标定 ${Math.min(...Object.values(shifts)).toFixed(3)}…${Math.max(...Object.values(shifts)).toFixed(3)} m，`
      + `最深接触 ${deepest.toFixed(3)} m`,
    );
  }

  manifest.schema = 2;
  manifest.pelvisTracksRestoredFrom = options.donor;
  manifest.pelvisTracksRestoreNote =
    "v3 重烘丢了根骨（骨盆）位移轨道，十六条 clip 的人全钉在站立高度；"
    + "由 Script_RestoreLugouPelvisTracks.mjs 从 v1 资产搬回位移并逐 clip 对回接触深度，旋转与网格未动。"
    + "本次的 maxGroundCorrectionMeters 记的是那一步写给 GroundRoot 的接触标定常数"
    + "（可正可负），不是烘焙时的只抬不放补偿。";
  if (!options.dryRun) {
    // 与 Script_BakeLugouCharacters.py 的 json.dumps(indent=2) 逐字节对齐：
    // 两空格缩进、不转义非 ASCII、**文件末尾不留换行**。差一个字节就是一屏假 diff。
    fs.writeFileSync(manifestPath, PythonJson(manifest), "utf8");
  }
  for (const line of report) console.log(line);
  console.log(options.dryRun ? "（dry-run，未写盘）" : `WROTE ${manifestPath}`);
}

Main();
