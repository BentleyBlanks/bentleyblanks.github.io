// 第一关帧取证的**共享机位**（Node 侧辅助，不进浏览器模块图、不登记 import map）。
//
// 三个固定机位原来在 Script_FirstLevelFrameProbe 里抄了四份；Script_ProfileCli
// 要用同一套摆位，所以抽到这里。`PoseView` 是**传给 page.evaluate 的函数** ——
// playwright 序列化的是它的源码，所以它只能用自己的参数，不许引用模块作用域里的
// 任何东西（包括这里 import 的 MISSION_ANCHORS，必须当参数传进去）。
//
// 机位：
//   bunker     掩蔽部里（开局原地，不动任务进度）
//   front      前沿机枪位朝北（跳到 04 MachineGun、瞬移到 A.gun、跑 5 秒让前沿真的打起来）
//   frontEast  同一位置改朝东（沿交通壕看过去，另一组可见集合）
//   custom     任意 {x,y,z,yaw,pitch}

import { MISSION_ANCHORS } from "./Data_FirstLevelMissionLayout.mjs";

export { MISSION_ANCHORS };
export const VIEW_NAMES = ["bunker", "front", "frontEast"];

/**
 * 页面内摆位。**不要在这里引用模块作用域** —— 它是被序列化过去执行的。
 * @param {object} options.A             MISSION_ANCHORS（必须当参数传）
 * @param {string} options.name          bunker / front / frontEast
 * @param {object} options.custom        {x,y,z,yaw,pitch}，给了就直接摆这个位姿
 * @param {number} options.settleFrames  摆完再推几帧（出图/取证前让画面收敛）
 * @param {number} options.settleDt      那几帧的 dt（0 = 定帧）
 */
export async function PoseView({ A, name, custom = null, settleFrames = 0, settleDt = 0 }) {
  const g = window.Tengxian;
  g.state.menu = false;
  if (custom) {
    const p = g.player.position;
    p.set(custom.x, custom.y, custom.z);
    g.player.body?.Teleport(p.x, p.y, p.z);
    g.player.yaw = custom.yaw;
    g.player.pitch = custom.pitch;
    g.StepFrames(5, 1 / 60, true);
  } else if (name === "front" || name === "frontEast") {
    await g.Debug.FirstLevelJump(4);   // 04 MachineGun：旧军列开场的那几条事实已经不存在
    g.StepFrames(2, 1 / 60, false);
    const p = g.player.position;
    p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
    g.player.body?.Teleport(p.x, p.y, p.z);
    g.player.yaw = name === "frontEast" ? -Math.PI / 2 : 0;
    g.player.pitch = 0;
    g.StepFrames(302, 1 / 60, false);
  }
  if (settleFrames > 0) g.StepFrames(settleFrames, settleDt, true);
}

/** Node 侧：把机位摆好。`custom` 是 "x,y,z,yaw,pitch" 解析出来的对象。 */
export async function SetupView(page, name, { custom = null, settleFrames = 0, settleDt = 0 } = {}) {
  await page.evaluate(PoseView, { A: MISSION_ANCHORS, name, custom, settleFrames, settleDt });
}

/** "x,y,z,yaw,pitch"（yaw/pitch 是弧度）→ 对象；不是这个形状就返回 null。 */
export function ParseCustomView(text) {
  const parts = String(text).split(",").map((value) => Number(value.trim()));
  if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) return null;
  return { x: parts[0], y: parts[1], z: parts[2], yaw: parts[3] || 0, pitch: parts[4] || 0 };
}

/** 把 CDP 的采样树折成「自身时间」表（每帧 ms）。 */
export function FoldProfile(profile, frameCount, limit = 40) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const totalUs = (profile.endTime - profile.startTime);
  let samples = 0;
  const counts = new Map();
  for (const id of profile.samples) { counts.set(id, (counts.get(id) || 0) + 1); samples += 1; }
  for (const [id, count] of counts) {
    const node = byId.get(id); if (!node) continue;
    const f = node.callFrame;
    const file = (f.url || "").split("/").pop().split("?")[0];
    const key = `${f.functionName || "(anonymous)"} @ ${file}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + count);
  }
  const msPerSample = samples ? (totalUs / 1000) / samples : 0;
  const rows = [...self.entries()].map(([key, count]) => ({ key, msPerFrame: Math.round(count * msPerSample / frameCount * 1000) / 1000 }))
    .sort((a, b) => b.msPerFrame - a.msPerFrame).slice(0, limit);
  return { profiledMsPerFrame: Math.round((totalUs / 1000) / frameCount * 100) / 100, samples, rows };
}
