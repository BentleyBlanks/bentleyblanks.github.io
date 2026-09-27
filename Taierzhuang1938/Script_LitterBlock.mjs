// 抬着的担架挡人（2026-09-27）。
//
// 担架员本人是软分离里「钉住」的人（`AiDirector.CrowdPinned` 认 carryRole），
// 别人撞到他们会被推开；但两人中间那副担架和上面的伤员只是道具，没有碰撞 ——
// 队友的目标点在担架另一边时，直接从前后两个担架员中间穿过去。
//
// 这里把「前位担架员 → 后位（另一个担架员或玩家）」当成一段有宽度的线段：
//   · `LitterSegments` 每帧收集正在抬着的担架；
//   · `LitterPush` 给已经站进担架里的人算往外让的量（并进 crowdPush，限速同软分离）；
//   · `BlockStepByLitters` 把这一步裁成不会穿进担架的位移（削掉法向分量、贴边滑），
//     结果照样交给 `CharacterBody.Move`，墙仍然说了算。
//
// 谁算在抬：`carryRole === "front"` 的人身上挂 `carryLitterRear`（后位的人，或字符串
// "player" 表示玩家接了后端），由 Script_MissionSetpieces 每帧写。后位是 AI 时还要求
// 他活着、`carryRole === "rear"`；担架落地（任一人倒下）时两边的 carryRole 都清掉，线段就没了。
//
// 数值在 `Data_Tuning_Ai.CROWD`（litterHalfWidthM）。纯规则：不 import three。

/** 收集这一帧正在抬着的担架线段。`out` 复用。 */
export function LitterSegments(soldiers, player, out = []) {
  out.length = 0;
  if (!soldiers) return out;
  for (let i = 0; i < soldiers.length; i += 1) {
    const front = soldiers[i];
    if (!front.alive || front.carryRole !== "front" || !front.carryLitterRear || !front.position) continue;
    let rear = front.carryLitterRear;
    if (rear === "player") {
      if (!player?.position || player.Alive === false) continue;
      rear = player;
    } else if (!rear.alive || rear.carryRole !== "rear" || !rear.position) continue;
    out.push({ front, rear, ax: front.position.x, az: front.position.z, bx: rear.position.x, bz: rear.position.z,
      y: Math.min(front.position.y, rear.position.y) });
  }
  return out;
}

/** 点 (px, pz) 到线段最近点的偏移 (ox, oz) 与距离 d。 */
function Offset(seg, px, pz, o) {
  const sx = seg.bx - seg.ax, sz = seg.bz - seg.az, len2 = sx * sx + sz * sz;
  let t = len2 > 1e-8 ? ((px - seg.ax) * sx + (pz - seg.az) * sz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  o.x = px - (seg.ax + sx * t); o.z = pz - (seg.az + sz * t); o.d = Math.hypot(o.x, o.z);
  // 正好压在担架中线上：没有方向，取担架的一侧法线（墙会替它挑对的那边）。
  if (o.d < 1e-5) {
    const l = Math.sqrt(len2);
    if (l > 1e-4) { o.nx = -sz / l; o.nz = sx / l; } else { o.nx = 1; o.nz = 0; }
  }
  else { o.nx = o.x / o.d; o.nz = o.z / o.d; }
  return o;
}

const Skip = (s, seg, maxDy) => s === seg.front || s === seg.rear || Math.abs(s.position.y - seg.y) > maxDy;

/**
 * 已经站进担架里的人往外让的量（加到 out.x/out.z 上）。
 * @param clearance  担架半宽 + 人的半径
 */
export function LitterPush(s, segs, clearance, maxStep, maxDy, out) {
  const o = {};
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    if (Skip(s, seg, maxDy)) continue;
    Offset(seg, s.position.x, s.position.z, o);
    if (o.d >= clearance) continue;
    const push = Math.min(clearance - o.d, maxStep);
    out.x += o.nx * push; out.z += o.nz * push;
  }
  return out;
}

/**
 * 把这一步 (dx, dz) 裁成不会穿进任何担架的位移：朝担架的分量削掉、沿担架边沿滑；
 * 已经在里面的人只许往外（或沿着）走，不许更深。
 * @returns {{dx:number,dz:number,blocked:boolean}}
 */
export function BlockStepByLitters(s, dx, dz, segs, clearance, maxDy, out = {}) {
  out.dx = dx; out.dz = dz; out.blocked = false;
  if (!segs || !segs.length) return out;
  const p = s.position, o0 = {}, o1 = {};
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i];
      if (Skip(s, seg, maxDy)) continue;
      Offset(seg, p.x, p.z, o0);
      Offset(seg, p.x + dx, p.z + dz, o1);
      if (o0.d < clearance - 1e-3) {
        if (o1.d >= o0.d) continue;
        const inward = dx * o0.nx + dz * o0.nz;
        if (inward < 0) { dx -= inward * o0.nx; dz -= inward * o0.nz; changed = true; }
        continue;
      }
      if (o1.d >= clearance - 1e-9) continue;
      const inward = dx * o0.nx + dz * o0.nz;
      if (inward < 0) { dx -= inward * o0.nx; dz -= inward * o0.nz; }
      // 削完还在里面（绕着担架头拐弯）：把终点放回边沿上。
      Offset(seg, p.x + dx, p.z + dz, o1);
      if (o1.d < clearance - 1e-9) {
        const cx = p.x + dx - o1.x, cz = p.z + dz - o1.z;
        dx = cx + o1.nx * clearance - p.x; dz = cz + o1.nz * clearance - p.z;
      }
      changed = true;
    }
    if (!changed) break;
    out.blocked = true;
  }
  out.dx = dx; out.dz = dz;
  return out;
}
