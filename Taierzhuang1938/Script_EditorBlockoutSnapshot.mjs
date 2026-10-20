// 白盒编辑器「复制当前位置」（docs/Data_EditorBlockout.md §4.2）：纯函数，零 three、零 DOM。
//
// 用户按 P（或卡片上的复制按钮）把「我现在在哪、看着什么、在哪个关键帧」整理成一段文字放进剪贴板，
// 直接贴给 agent。文字前半给人看（也给 agent 读懂意思），最后一行「数据：」是一行 JSON，数字以它为准；
// 中间的「重现」链接带 pose=，原样打开就是同一个机位（agent 可以无头打开它截图）。
//
// 坐标口径与配置文件一致：x 向东为正、z 向南为正（米）；朝向 yawDeg 0 = 北、+90 = 西；俯仰 pitchDeg 正 = 抬头。

import { YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";

export const SNAPSHOT_SCHEMA = "tengxian-blockout-snapshot/1";
export const SNAPSHOT_DATA_PREFIX = "数据：";
const STANCES = Object.freeze(["stand", "crouch", "prone"]);
const STANCE_TEXT = Object.freeze({ stand: "站", crouch: "蹲", prone: "趴" });
const SIDE_TEXT = Object.freeze({ nra: "友", ija: "敌", civ: "百姓" });

const Num = (v) => typeof v === "number" && Number.isFinite(v);
export function RoundTo(value, digits) { const k = 10 ** digits; return Math.round(value * k) / k; }
function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
function Fixed(v, digits) { return Num(v) ? v.toFixed(digits) : "?"; }
function Signed(v, digits) { return Num(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}` : "?"; }

/** 相对朝向（度，正 = 在左边）→「正前方 / 左 23° / 右后 140°」之类的人话。 */
export function BearingText(relDeg) {
  if (!Num(relDeg)) return "";
  const rel = WrapDeg(relDeg), abs = Math.abs(rel), side = rel > 0 ? "左" : "右";
  if (abs < 6) return "正前方";
  if (abs > 174) return "正后方";
  return abs <= 90 ? `${side}前 ${Math.round(abs)}°` : `${side}后 ${Math.round(abs)}°`;
}

/**
 * URL 里的 pose 参数：x,z,yawDeg,pitchDeg,stance（米 / 度，两位、一位小数）。
 * 飞行观察（§4.3）复制出来的多一个第 6 项：相机离地的绝对高度 flyY（米，两位小数）——打开后玩家落在 x,z，再从这个高度起飞。
 */
export function PoseParam(pose) {
  if (!pose || !Num(pose.x) || !Num(pose.z)) return "";
  const stance = STANCES.includes(pose.stance) ? pose.stance : "stand";
  const parts = [RoundTo(pose.x, 2), RoundTo(pose.z, 2), RoundTo(WrapDeg(pose.yawDeg || 0), 1), RoundTo(pose.pitchDeg || 0, 1), stance];
  if (Num(pose.flyY)) parts.push(RoundTo(pose.flyY, 2));
  return parts.join(",");
}

/** PoseParam 的反向；不合法 → null（不认的就当没给，照常落在关键帧机位）。 */
export function ParsePoseParam(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const parts = text.split(",").map(s => s.trim());
  if (parts.length < 2) return null;
  const [x, z, yaw, pitch] = parts.slice(0, 4).map(Number);
  if (!Num(x) || !Num(z)) return null;
  const pose = { x, z, yawDeg: Num(yaw) ? WrapDeg(yaw) : 0, pitchDeg: Num(pitch) ? Math.max(-89, Math.min(89, pitch)) : 0, stance: "stand" };
  if (STANCES.includes(parts[4])) pose.stance = parts[4];
  if (parts.length >= 6 && parts[5] !== "" && Num(Number(parts[5]))) pose.flyY = Number(parts[5]);
  return pose;
}

/**
 * 编辑器现场 → 一份只有数字和字符串的快照（数字已按显示精度取整）。
 * @param {object} input
 *   level { key, label, configPath }   keyframe { id, index, count, stage, stageTitle, name, what, next, player }
 *   player { x, y, z, eyeY, yawDeg, pitchDeg, stance }   aim { kind:"block"|"ground"|"none", x,y,z, distM, id?, tag?, semantic? }
 *   units [{ id, name, side, kind, x, z }]   pois [{ id, name, kind, x, z }]   map { open, cx, cz, spanM } | null
 *   url（不带 pose 的当前地址）  nearM（附近多远以内列出来，默认 30）  nearMax（最多列几个，默认 8）
 */
export function BuildBlockoutSnapshot(input) {
  const p = input.player || {};
  const kf = input.keyframe || null;
  const at = { x: p.x, z: p.z };
  const Rel = (x, z) => RoundTo(WrapDeg(YawDegFromTo(at, { x, z }) - (p.yawDeg || 0)), 0);
  const Dist = (x, z) => RoundTo(Math.hypot(x - p.x, z - p.z), 1);
  const nearM = input.nearM ?? 30, nearMax = input.nearMax ?? 8;
  const near = [];
  for (const u of input.units || []) {
    if (!Num(u.x) || !Num(u.z)) continue;
    const distM = Dist(u.x, u.z);
    if (distM <= nearM) near.push({ type: "unit", id: u.id, name: u.name || "", side: u.side || "", kind: u.kind || "", distM, relDeg: Rel(u.x, u.z), x: RoundTo(u.x, 1), z: RoundTo(u.z, 1) });
  }
  for (const poi of input.pois || []) {
    if (!Num(poi.x) || !Num(poi.z)) continue;
    const distM = Dist(poi.x, poi.z);
    if (distM <= nearM) near.push({ type: "poi", id: poi.id, name: poi.name || "", kind: poi.kind || "", distM, relDeg: Rel(poi.x, poi.z), x: RoundTo(poi.x, 1), z: RoundTo(poi.z, 1) });
  }
  near.sort((a, b) => a.distM - b.distM);
  const kfPlayer = kf?.player && Num(kf.player.x) ? {
    x: RoundTo(kf.player.x, 2), z: RoundTo(kf.player.z, 2), yawDeg: RoundTo(WrapDeg(kf.player.yawDeg || 0), 1),
    pitchDeg: RoundTo(kf.player.pitchDeg || 0, 1), stance: kf.player.stance || "stand",
  } : null;
  const next = kf?.next ? {
    text: kf.next.text || "",
    ...(Num(kf.next.x) ? { x: RoundTo(kf.next.x, 1), z: RoundTo(kf.next.z, 1), distM: Dist(kf.next.x, kf.next.z), relDeg: Rel(kf.next.x, kf.next.z) } : {}),
  } : null;
  const aim = input.aim && input.aim.kind !== "none" ? {
    kind: input.aim.kind, x: RoundTo(input.aim.x, 2), y: RoundTo(input.aim.y, 2), z: RoundTo(input.aim.z, 2), distM: RoundTo(input.aim.distM, 1),
    ...(input.aim.id ? { id: input.aim.id } : {}), ...(input.aim.tag ? { tag: input.aim.tag } : {}), ...(input.aim.semantic ? { semantic: input.aim.semantic } : {}),
  } : { kind: "none" };
  const player = {
    x: RoundTo(p.x, 2), y: RoundTo(p.y, 2), z: RoundTo(p.z, 2), eyeY: RoundTo(p.eyeY, 2),
    yawDeg: RoundTo(WrapDeg(p.yawDeg || 0), 1), pitchDeg: RoundTo(p.pitchDeg || 0, 1),
    stance: STANCES.includes(p.stance) ? p.stance : "stand",
  };
  let reproduce = "";
  if (input.url) {
    try {
      // 逗号不转义（searchParams.set 会写成 %2C，链接难读）；URLSearchParams 读回来一样
      const url = new URL(input.url);
      url.searchParams.delete("pose");
      url.hash = "";
      reproduce = `${url.toString()}${url.search ? "&" : "?"}pose=${PoseParam(input.fly ? { ...player, flyY: player.eyeY } : player)}`;
    } catch { reproduce = ""; }
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    level: input.level?.key || "", levelLabel: input.level?.label || "", configPath: input.level?.configPath || "",
    keyframe: kf ? {
      id: kf.id, index: kf.index, count: kf.count, stage: kf.stage, stageTitle: kf.stageTitle || "", name: kf.name || "",
      what: kf.what || "", player: kfPlayer,
      offsetM: kfPlayer ? Dist(kfPlayer.x, kfPlayer.z) : null,
    } : null,
    next, player, aim,
    // 飞行观察（§4.3）：player 是飞行相机的位姿，玩家本人的位置另记在这里；没飞行时没有这个字段
    ...(input.fly ? { fly: { body: input.fly.body ? {
      x: RoundTo(input.fly.body.x, 2), y: RoundTo(input.fly.body.y, 2), z: RoundTo(input.fly.body.z, 2),
      yawDeg: RoundTo(WrapDeg(input.fly.body.yawDeg || 0), 1), pitchDeg: RoundTo(input.fly.body.pitchDeg || 0, 1),
      stance: STANCES.includes(input.fly.body.stance) ? input.fly.body.stance : "stand",
    } : null } } : {}),
    near: near.slice(0, nearMax),
    nearMore: Math.max(0, near.length - nearMax),
    map: input.map?.open ? { open: true, cx: RoundTo(input.map.cx, 1), cz: RoundTo(input.map.cz, 1), spanM: RoundTo(input.map.spanM, 0) } : null,
    reproduce,
  };
}

function NearText(item) {
  const who = item.type === "unit"
    ? `${item.name || item.id}（${SIDE_TEXT[item.side] || item.side || "?"}${item.kind && item.kind !== "soldier" ? `·${item.kind}` : ""}）`
    : `${item.name || item.id}（${item.kind === "danger" ? "危险" : item.kind === "objective" ? "目标" : item.kind === "landmark" ? "地标" : "要点"}）`;
  return `${who} ${BearingText(item.relDeg)} ${Fixed(item.distM, 1)} m`;
}

/** 快照 → 贴给 agent 的文字。最后一行「数据：」是整份快照的 JSON（一行）。 */
export function FormatBlockoutSnapshot(snap) {
  const lines = ["【滕县白盒编辑器 · 当前位置】"];
  lines.push(`关卡：${snap.levelLabel || snap.level}（${snap.level}）${snap.configPath ? `　配置：${snap.configPath}` : ""}`);
  const kf = snap.keyframe;
  if (kf) {
    const stage = Num(kf.stage) ? String(kf.stage).padStart(2, "0") : "";
    lines.push(`关键帧：${kf.id}（第 ${kf.index + 1}/${kf.count} 个）${stage} ${kf.stageTitle}${kf.name ? ` · ${kf.name}` : ""}`.trimEnd());
    if (kf.what) lines.push(`　此时：${kf.what}`);
    if (snap.next) {
      lines.push(Num(snap.next.x)
        ? `　下一步：${snap.next.text || "（没写）"} → x ${Fixed(snap.next.x, 1)}  z ${Fixed(snap.next.z, 1)}，离我 ${Fixed(snap.next.distM, 1)} m，在我${BearingText(snap.next.relDeg)}`
        : `　下一步：${snap.next.text || "（没写）"}`);
    }
    if (kf.player) {
      lines.push(`　关键帧机位：x ${Fixed(kf.player.x, 2)}  z ${Fixed(kf.player.z, 2)}　朝向 ${Signed(kf.player.yawDeg, 1)}°　俯仰 ${Signed(kf.player.pitchDeg, 1)}°　${STANCE_TEXT[kf.player.stance] || kf.player.stance}`);
    }
  } else {
    lines.push("关键帧：（没有）");
  }
  const p = snap.player;
  if (snap.fly) {
    // 飞行观察：「我现在」写的是飞行相机（没有脚，y 就是相机高度），玩家本人没动
    lines.push(`我现在（飞行观察相机）：x ${Fixed(p.x, 2)}  y ${Fixed(p.y, 2)}  z ${Fixed(p.z, 2)}${kf?.offsetM != null ? `（离关键帧机位 ${Fixed(kf.offsetM, 1)} m）` : ""}　朝向 ${Signed(p.yawDeg, 1)}°　俯仰 ${Signed(p.pitchDeg, 1)}°`);
    const b = snap.fly.body;
    if (b) lines.push(`　玩家本人没动：x ${Fixed(b.x, 2)}  z ${Fixed(b.z, 2)}　朝向 ${Signed(b.yawDeg, 1)}°　${STANCE_TEXT[b.stance] || b.stance}`);
  } else {
    lines.push(`我现在：x ${Fixed(p.x, 2)}  y ${Fixed(p.y, 2)}  z ${Fixed(p.z, 2)}${kf?.offsetM != null ? `（离关键帧机位 ${Fixed(kf.offsetM, 1)} m）` : ""}　朝向 ${Signed(p.yawDeg, 1)}°　俯仰 ${Signed(p.pitchDeg, 1)}°　${STANCE_TEXT[p.stance] || p.stance}　眼睛 y ${Fixed(p.eyeY, 2)}`);
  }
  const aim = snap.aim;
  if (aim.kind === "block") {
    const name = [aim.id, aim.semantic && aim.semantic !== aim.id ? aim.semantic : "", aim.tag && !aim.id ? aim.tag : ""].filter(Boolean).join(" / ") || "一块白盒";
    lines.push(`准星对着：体块 ${name}，打在 x ${Fixed(aim.x, 2)}  y ${Fixed(aim.y, 2)}  z ${Fixed(aim.z, 2)}，离眼睛 ${Fixed(aim.distM, 1)} m`);
  } else if (aim.kind === "ground") {
    lines.push(`准星对着：地面 x ${Fixed(aim.x, 2)}  y ${Fixed(aim.y, 2)}  z ${Fixed(aim.z, 2)}，离眼睛 ${Fixed(aim.distM, 1)} m`);
  } else {
    lines.push("准星对着：天空（这个方向 300 m 内没有东西）");
  }
  if (snap.near.length) {
    lines.push(`附近 30 m：${snap.near.map(NearText).join("；")}${snap.nearMore ? `；另有 ${snap.nearMore} 个没列` : ""}`);
  }
  if (snap.map) lines.push(`全关总图开着：中心 x ${Fixed(snap.map.cx, 1)}  z ${Fixed(snap.map.cz, 1)}，横向约 ${Fixed(snap.map.spanM, 0)} m`);
  if (snap.reproduce) lines.push(`重现这个机位${snap.fly ? "（打开后进飞行观察，相机在这个高度）" : ""}：${snap.reproduce}`);
  lines.push("口径：x 向东为正、z 向南为正（米）；朝向 0°=北、+90°=西；俯仰正=抬头；「左 23°」= 要往左转 23° 才正对。格式见 Taierzhuang1938/docs/Data_EditorBlockout.md §4.2");
  lines.push(`${SNAPSHOT_DATA_PREFIX}${JSON.stringify(snap)}`);
  return lines.join("\n");
}

/** 贴回来的文字 → 快照对象（找「数据：」那一行）；找不到或坏了 → null。 */
export function ParseBlockoutSnapshot(text) {
  if (typeof text !== "string") return null;
  const line = text.split(/\r?\n/).reverse().find(l => l.startsWith(SNAPSHOT_DATA_PREFIX));
  if (!line) return null;
  try {
    const snap = JSON.parse(line.slice(SNAPSHOT_DATA_PREFIX.length));
    return snap && snap.schema === SNAPSHOT_SCHEMA ? snap : null;
  } catch {
    return null;
  }
}
