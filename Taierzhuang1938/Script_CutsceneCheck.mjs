// 过场数据自检 —— **纯数据，不 import three**，Node 里能直接跑：
//   node Taierzhuang1938/Script_CutsceneCheck.mjs            全部五场
//   node Taierzhuang1938/Script_CutsceneCheck.mjs CS_Chuchuan 只查一场
//
// Script_Cutscene.mjs（要起 three）从这里 re-export ValidateCutscene / ValidateAllCutscenes，
// 所以正片 Play() 前的硬断言与命令行跑的是同一份规则。
//
// 两档输出：
//   problems  硬错：播出来必然是错的（时长不等、缺机位、人物表没有这个人……）。Play() 见到就抛。
//   warnings  软错：能播但八成不对劲（字幕读不完、轨道滑步、相机锚在没有的演员上……）。
//             命令行打印出来，Play() 不管。

import { CUTSCENES, CAST } from "./Data_TengxianScript.mjs";

/** 字幕/台词的最短可读时长：每个汉字 0.22 s + 1.2 s（docs/Data_CutsceneRedo.md §1.4）。 */
export function MinReadSeconds(text) {
  const chars = String(text || "").replace(/\s+/g, "").length;
  return chars * 0.22 + 1.2;
}

export function ResolveHeadLookConfig(cut, shot = null) {
  const source = shot?.headLook || shot?.camera?.headLook || cut?.headLook || {};
  const range = (value, fallback) => {
    if (Array.isArray(value) && value.length >= 2) {
      const a = Number(value[0]), b = Number(value[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
    }
    if (Number.isFinite(value)) return [-Math.abs(value), Math.abs(value)];
    return fallback;
  };
  return {
    yaw: range(source.yaw ?? source.yawLimit ?? cut?.yawLimit, [-0.65, 0.65]),
    pitch: range(source.pitch ?? source.pitchLimit ?? cut?.pitchLimit, [-0.38, 0.38]),
    sensitivityScale: Math.max(0, Math.min(4, Number(source.sensitivityScale ?? cut?.sensitivityScale ?? 1) || 0)),
  };
}

export function ClampHeadLook(value, range) {
  const number = Number.isFinite(value) ? value : 0;
  return Math.max(range[0], Math.min(range[1], number));
}

/** 一场过场的硬错。 */
export function ValidateCutscene(cut, cast = CAST) {
  const problems = [];
  if (!cut || !cut.id) return ["过场数据为空"];
  const shots = cut.shots || [];
  if (!shots.length) problems.push(`${cut.id}: 没有任何分镜`);
  const cameraModes = new Set(["director", "headLook"]);
  const checkRange = (value, label) => {
    if (value === undefined) return;
    if (Array.isArray(value) && value.length >= 2 && value.every((n) => Number.isFinite(Number(n)))) {
      if (Number(value[0]) > Number(value[1])) problems.push(`${cut.id}: ${label} 范围倒置`);
      return;
    }
    if (!Number.isFinite(Number(value))) problems.push(`${cut.id}: ${label} 不是数字或二元范围`);
  };
  checkRange(cut.yawLimit, "yawLimit");
  checkRange(cut.pitchLimit, "pitchLimit");
  checkRange(cut.headLook?.yaw, "headLook.yaw");
  checkRange(cut.headLook?.pitch, "headLook.pitch");
  if (cut.sensitivityScale !== undefined && (!Number.isFinite(Number(cut.sensitivityScale)) || Number(cut.sensitivityScale) < 0)) {
    problems.push(`${cut.id}: sensitivityScale 必须是非负数字`);
  }
  const sum = shots.reduce((a, s) => a + (s.seconds || 0), 0);
  if (Math.abs(sum - cut.seconds) > 0.005) {
    problems.push(`${cut.id}: 分镜秒数之和 ${sum.toFixed(2)} ≠ 声明时长 ${cut.seconds}`);
  }
  const castIds = new Set((cut.cast || []).map((c) => c.id));
  for (const shot of shots) {
    if (!shot.camera || !shot.camera.from) problems.push(`${cut.id} 镜${shot.n}: 缺机位`);
    if (!shot.focalMm) problems.push(`${cut.id} 镜${shot.n}: 缺焦距`);
    const cam = shot.camera || {};
    const mode = shot.cameraMode || cam.cameraMode || cut.cameraMode || "director";
    if (!cameraModes.has(mode)) problems.push(`${cut.id} 镜${shot.n}: 未知 cameraMode「${mode}」`);
    checkRange(shot.headLook?.yaw ?? cam.headLook?.yaw, `镜${shot.n} headLook.yaw`);
    checkRange(shot.headLook?.pitch ?? cam.headLook?.pitch, `镜${shot.n} headLook.pitch`);
    // blendIn：自由段 → 固定演出的视角过渡秒数（2026-08-28 INT1）。
    // 负数或非数字会让过渡在第一帧就"完成"，表现与没写一样 —— 静默失败，所以硬查。
    const blendIn = shot.headLook?.blendIn ?? cam.headLook?.blendIn;
    if (blendIn !== undefined && (!Number.isFinite(Number(blendIn)) || Number(blendIn) < 0)) {
      problems.push(`${cut.id} 镜${shot.n}: headLook.blendIn 必须是非负数字`);
    }
    // 过场音效的淡变字段。写错了听不出来是"没渐变"还是"没这条音"，所以也硬查。
    for (const sfx of shot.sfx || []) {
      if (!sfx || typeof sfx.name !== "string" || !sfx.name) {
        problems.push(`${cut.id} 镜${shot.n}: sfx 缺 name`);
        continue;
      }
      for (const field of ["fadeIn", "fadeOut", "seconds"]) {
        if (sfx[field] === undefined) continue;
        if (!Number.isFinite(Number(sfx[field])) || Number(sfx[field]) < 0) {
          problems.push(`${cut.id} 镜${shot.n}: sfx「${sfx.name}」的 ${field} 必须是非负数字`);
        }
      }
      if (sfx.crossfade !== undefined && typeof sfx.crossfade !== "string" && typeof sfx.crossfade !== "boolean") {
        problems.push(`${cut.id} 镜${shot.n}: sfx「${sfx.name}」的 crossfade 只能是别的 cue 名或 true`);
      }
    }
    if (cam.fromActor && !castIds.has(cam.fromActor)) problems.push(`${cut.id} 镜${shot.n}: fromActor「${cam.fromActor}」不在 cast 里`);
    if (cam.lookActor && !castIds.has(cam.lookActor)) problems.push(`${cut.id} 镜${shot.n}: lookActor「${cam.lookActor}」不在 cast 里`);
    for (const line of shot.lines || []) {
      if (line.who && !cast[line.who] && !(cut.people && cut.people[line.who])) {
        problems.push(`${cut.id} 镜${shot.n}: 人物表里没有 ${line.who}`);
      }
      if ((line.voiceCue ?? line.voice) !== undefined && typeof (line.voiceCue ?? line.voice) !== "string") {
        problems.push(`${cut.id} 镜${shot.n}: 台词 voice cue 必须是字符串`);
      }
    }
    for (const sub of shot.subs || []) {
      if ((sub.voiceCue ?? sub.voice) !== undefined && typeof (sub.voiceCue ?? sub.voice) !== "string") {
        problems.push(`${cut.id} 镜${shot.n}: 字幕 voice cue 必须是字符串`);
      }
    }
    for (const move of shot.propMoves || []) {
      if (!(cut.props || []).some((p) => p.name === move.name)) problems.push(`${cut.id} 镜${shot.n}: propMoves 指向不存在的道具「${move.name}」`);
    }
  }
  // ambientMotion 的减速段（2026-08-28 INT1）：decelSeconds 只有配着 stopAt 才有意义，
  // 单写一个 decelSeconds 是"永远不会到来的减速"，画面上完全看不出写错了。
  for (const move of cut.ambientMotion || []) {
    if (move.decelSeconds === undefined) continue;
    if (!Number.isFinite(Number(move.decelSeconds)) || Number(move.decelSeconds) < 0) {
      problems.push(`${cut.id}: ambientMotion「${move.name}」的 decelSeconds 必须是非负数字`);
    } else if (!Number.isFinite(Number(move.stopAt))) {
      problems.push(`${cut.id}: ambientMotion「${move.name}」写了 decelSeconds 却没有 stopAt（减不到头）`);
    }
  }
  for (const actor of cut.cast || []) {
    if (!actor.track || !actor.track.length) { problems.push(`${cut.id}: ${actor.id} 没有轨道`); continue; }
    const attachments = Array.isArray(actor.attachments) ? actor.attachments
      : (Array.isArray(actor.mounts) ? actor.mounts : []);
    for (const attachment of attachments) {
      const propName = attachment.name || attachment.prop || attachment.propName;
      if (!propName || !(cut.props || []).some((p) => p.name === propName)) {
        problems.push(`${cut.id}: ${actor.id} 挂载指向不存在的道具「${propName || ""}」`);
      }
      if (!(attachment.mount || attachment.mountName)) problems.push(`${cut.id}: ${actor.id} 挂载缺少 mount`);
    }
    for (let i = 1; i < actor.track.length; i += 1) {
      if (actor.track[i].t < actor.track[i - 1].t) {
        problems.push(`${cut.id}: ${actor.id} 的关键帧时间没有递增（第 ${i} 帧）`);
      }
    }
  }
  return problems;
}

/** 一场过场的软错。 */
export function LintCutscene(cut) {
  const warnings = [];
  if (!cut || !cut.id) return warnings;
  let at = 0;
  for (const shot of cut.shots || []) {
    for (const sub of shot.subs || []) {
      const need = MinReadSeconds(sub.text);
      const have = sub.seconds || 3.0;
      if (!shot.timingLocked && have + 0.05 < need) warnings.push(`${cut.id} 镜${shot.n} 字幕「${String(sub.text).slice(0, 14)}…」只给了 ${have}s，按字数至少 ${need.toFixed(1)}s`);
      if (sub.at + have > shot.seconds + 0.05) warnings.push(`${cut.id} 镜${shot.n} 字幕「${String(sub.text).slice(0, 14)}…」到 ${(sub.at + have).toFixed(1)}s 才消失，可本镜只有 ${shot.seconds}s（会被下一镜截断）`);
      if (String(sub.text).length > 34) warnings.push(`${cut.id} 镜${shot.n} 字幕超过 34 字（${String(sub.text).length}），拆成两条`);
    }
    for (const line of shot.lines || []) {
      const need = MinReadSeconds(line.text);
      const have = line.seconds || 3.0;
      if (!shot.timingLocked && have + 0.05 < need) warnings.push(`${cut.id} 镜${shot.n} 台词「${String(line.text).slice(0, 14)}…」只给了 ${have}s，按字数至少 ${need.toFixed(1)}s`);
      if (String(line.text).length > 26) warnings.push(`${cut.id} 镜${shot.n} 台词超过 26 字（${String(line.text).length}），拆成两句`);
    }
    // 同一镜里多句台词重叠：后一句会把前一句顶掉
    const lines = (shot.lines || []).slice().sort((a, b) => a.at - b.at);
    for (let i = 1; i < lines.length; i += 1) {
      const prevEnd = lines[i - 1].at + (lines[i - 1].seconds || 3.0);
      if (lines[i].at < prevEnd - 0.05) warnings.push(`${cut.id} 镜${shot.n} 第 ${i + 1} 句台词在 ${lines[i].at}s 顶掉了还没说完的上一句（到 ${prevEnd.toFixed(1)}s）`);
    }
    at += shot.seconds;
  }
  // 轨道滑步：两帧之间的水平速度要 ≈ moveSpeed×4.2（容差 ±35%），换场（hidden）那一段不算。
  // 如果角色随移动布景经过，travelSpeed 记录世界坐标合速度；moveSpeed 仍保持本地步态，
  // 因而站台不会把慢走动画误报成滑步。
  for (const actor of cut.cast || []) {
    const track = actor.track || [];
    for (let i = 1; i < track.length; i += 1) {
      const a = track[i - 1], b = track[i];
      if ((a.state && a.state.hidden) || (b.state && b.state.hidden)) continue;
      const dt = Math.max(1e-3, b.t - a.t);
      const dist = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]);
      const speed = dist / dt;
      const ms = ((a.state && a.state.moveSpeed) || 0);
      const travel = Number((a.state && a.state.travelSpeed));
      const want = Number.isFinite(travel) ? travel : ms * 4.2;
      if (speed > 4.6) warnings.push(`${cut.id}: ${actor.id} 第 ${i} 帧 ${speed.toFixed(1)} m/s —— 人不会这么快，是不是忘了插 hidden 帧`);
      else if (want > 0.05 && Math.abs(speed - want) > want * 0.35 + 0.05) warnings.push(`${cut.id}: ${actor.id} 第 ${i} 帧轨道 ${speed.toFixed(2)} m/s 但 moveSpeed ${ms} ↔ ${want.toFixed(2)} m/s（滑步/踏步）`);
      else if (want < 0.05 && speed > 0.25) warnings.push(`${cut.id}: ${actor.id} 第 ${i} 帧 moveSpeed 0 却在动（${speed.toFixed(2)} m/s，会像被拖着走）`);
    }
  }
  if (cut.standalone && cut.setOrigin) {
    const [x, , z] = cut.setOrigin;
    const cheb = Math.max(Math.abs(x), Math.abs(z));
    if (cheb < 1800) warnings.push(`${cut.id}: 独立布景原点离城心只有 ${cheb} m，1700 m 内铺着真地形，会和自己的地面打架`);
  }
  return warnings;
}

export function ValidateAllCutscenes(table = CUTSCENES) {
  const problems = [];
  for (const cut of Object.values(table)) problems.push(...ValidateCutscene(cut));
  return problems;
}

export function LintAllCutscenes(table = CUTSCENES) {
  const warnings = [];
  for (const cut of Object.values(table)) warnings.push(...LintCutscene(cut));
  return warnings;
}

// 命令行入口
if (typeof process !== "undefined" && process.argv[1] && /Script_CutsceneCheck\.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const table = only.length ? Object.fromEntries(only.map((id) => [id, CUTSCENES[id]]).filter(([, c]) => c)) : CUTSCENES;
  const problems = ValidateAllCutscenes(table);
  const warnings = LintAllCutscenes(table);
  for (const cut of Object.values(table)) {
    console.log(`${cut.id}「${cut.title}」 ${cut.seconds}s · ${cut.shots.length} 镜 · ${(cut.cast || []).length} 人 · ${(cut.props || []).length} 道具`);
  }
  if (problems.length) { console.log(`\n硬错 ${problems.length} 条：`); for (const p of problems) console.log("  ✗ " + p); }
  if (warnings.length) { console.log(`\n软错 ${warnings.length} 条：`); for (const w of warnings) console.log("  ! " + w); }
  if (!problems.length && !warnings.length) console.log("\n全过。");
  process.exit(problems.length ? 1 : 0);
}
