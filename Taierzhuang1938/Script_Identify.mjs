// 《血战台儿庄》目标识别 —— 准心此刻指着谁。
//
// 为什么单独一个模块（和 Script_Interact 同一个理由）：
// "谁在准心下面" 要被 HUD（面板）、难度（识别档位）和取证口三处读，
// 而判定本身是纯几何 + 一次通视查询，不该长在装配层的 if 串里。
//
// **这一层不 import three**：只吃 {x,y,z} 三元组，所以纯 Node 直接跑得起来
// （Script_HudPromptTest 就是这么测它的）。射线交给装配层注入的 Clear 钩子。
//
// 判定形状对齐 COD 的名牌：一个**贴着弹道的角度锥**，不是屏幕矩形 ——
// 近处按人体半径够得着，远处按角度收敛，于是"看起来压在准心上"就等于"识别得到"。
// 锥角至少与当前散布同宽：散布撑大到 7° 时准心画的就是 7°，
// 那么落在那个圈里的人本来就都是这一枪可能打到的人，识别范围与准心必须是同一件事。

import { WEAPONS } from "./Data_Weapons.mjs";

export const IDENTIFY = {
  /**
   * 识别距离上限。**这个数由雾定，不由步枪射程定。**
   * 后期雾是 fog = 1 − exp(−d × density)，density 按天光预设 0.0125—0.021；
   * 130 m 上已经吃掉八成对比（0.0150 档 fog = 0.86），再远玩家自己在画面上
   * 根本读不出那儿有个人 —— 名牌不许告诉玩家他看不见的东西，那是透视挂不是 HUD。
   * （中正式打得到 500 m，所以这一条与"打得到多远"无关，别拿射程来改它。）
   */
  rangeM: 130,
  /** 识别锥全角（度）。散布比它宽时按散布走。 */
  coneDeg: 2.4,
  /** 角度锥在远处的上限，免得一百米外一整条战线都算"指着"。 */
  coneCapM: 2.2,
  /** 枪口前这么近的东西不算目标（自己的枪、贴着的墙）。 */
  minRangeM: 1.2,
  /** 尸体只在这个距离内认，再远就只是地上的一团。 */
  corpseRangeM: 30,
  /** 目标掉出锥外之后卡片还留多久。没有它，人一动卡片就闪。 */
  holdS: 0.4,
};

/**
 * 人按**一根胶囊**算，不是一个球。
 *
 * 这一条是实测逼出来的：眼位 1.62 m、躯干中心 0.95 m，平视时两者差 0.67 m，
 * 而 2.4° 锥在 30 m 上只有 0.63 m 宽 —— 按球算的话，玩家平着看向三十米外的人
 * **一个都识别不到**（差 0.04 m），得先把准心压到他胸口才认。
 * 横向 0.45 m 是肩宽的一半，纵向按姿态给：站着 ±0.92 m（脚到头顶都算），
 * 趴下就收到 ±0.30 m —— 卧姿的人本来就只有一条线那么高，认起来当然更难。
 * 索引与 Script_Ai 的 CAPSULE / Script_Player 的 STANCE 同一套：0 站 1 蹲 2 卧。
 */
const CAPSULE = [
  { y: 0.95, halfH: 0.92 },
  { y: 0.66, halfH: 0.64 },
  { y: 0.30, halfH: 0.30 },
];
const BODY_HALF_W = 0.45;

/** 阵营显示名。中方一律"川军"—— 第 2 集团军的川军番号在阵亡卡里另有交代。 */
const FACTION_LABEL = { nra: "川军", ija: "日军" };

/** 日军兵种：按他手里那支枪读，不是按内部战术槽位读。 */
function IjaRole(soldier) {
  if (soldier.weaponId === "Type92Hmg") return "重机枪组";
  if (soldier.weaponId === "Type89Launcher") return "掷弹筒";
  if (soldier.weapon?.kind === "lmg") return "机枪手";
  if (soldier.tacticalRole === "leader") return "分队长";
  return "步兵";
}

function WeaponName(weaponId) {
  return WEAPONS[weaponId]?.name || "";
}

function Meters(dist) {
  return `${Math.max(1, Math.round(dist))}m`;
}

/**
 * 把一个目标做成 HUD 直接能画的卡片。纯函数。
 *
 * detail：
 *   "full"  —— 体验档：连血条一起给。
 *   "basic" —— 标准档：番号、兵种、枪、距离；伤情只给"负伤"两个字，不给数字。
 *   false   —— 写实档：这一层根本不跑（见 IdentifySystem.Update）。
 */
export function TargetCard(entity, dist, detail = "basic") {
  if (!entity) return null;
  if (entity.kind === "vehicle" || entity.kind === "emplacement") {
    // 载具/固定火力点由装配层按同一套字段挂进 extras（见 IdentifySystem.Update）。
    const bits = [entity.meta, Meters(dist)].filter(Boolean);
    return {
      key: `x${entity.id}`,
      faction: entity.side || "ija",
      kind: entity.kind,
      title: entity.title || "载具",
      meta: bits.join(" · "),
      health: detail === "full" && Number.isFinite(entity.health01) ? entity.health01 : null,
      dead: false,
    };
  }

  const identity = entity.identity || {};
  const weapon = WeaponName(entity.weaponId);
  const faction = entity.side === "nra" ? "nra" : "ija";

  if (!entity.alive) {
    // 阵亡的人仍然有名有姓 —— 这一版唯一一处把"这是谁"写在战场上的地方
    // 就是阵亡卡，尸体沿用同一套读法。日方不给姓名（玩家不该认得他们）。
    const loot = entity.drop && !entity.drop.taken
      ? `${WeaponName(entity.drop.weaponId)}${entity.drop.clips > 0 ? ` ${entity.drop.clips} 桥夹` : ""}`
      : "";
    const bits = faction === "nra"
      ? [identity.origin, loot, Meters(dist)]
      : [loot, Meters(dist)];
    return {
      key: `s${entity.id}`,
      faction,
      kind: "corpse",
      title: faction === "nra" ? `阵亡 ${identity.name || ""}`.trim() : "日军 阵亡",
      meta: bits.filter(Boolean).join(" · "),
      health: null,
      dead: true,
    };
  }

  const wounded = Number(entity.health) <= 55;
  if (faction === "nra") {
    const bits = [entity.towel ? "敢死队" : "", weapon, Meters(dist)];
    if (detail !== "full" && wounded) bits.push("负伤");
    return {
      key: `s${entity.id}`,
      faction,
      kind: "friend",
      title: identity.name || FACTION_LABEL.nra,
      meta: bits.filter(Boolean).join(" · "),
      health: detail === "full" ? Math.max(0, Math.min(1, Number(entity.health) / 100)) : null,
      dead: false,
    };
  }

  const bits = [weapon, Meters(dist)];
  if (detail !== "full" && wounded) bits.push("负伤");
  return {
    key: `s${entity.id}`,
    faction,
    kind: "enemy",
    title: `${FACTION_LABEL.ija} ${IjaRole(entity)}`,
    meta: bits.filter(Boolean).join(" · "),
    health: detail === "full" ? Math.max(0, Math.min(1, Number(entity.health) / 100)) : null,
    dead: false,
  };
}

/** 候选名额。锥内第一名被墙挡住时还有两次机会，不至于"旁边看得见的人反而不认"。 */
const SLOTS = 3;

export class IdentifySystem {
  /**
   * @param {object} hooks
   *   Clear(eye, point) -> boolean   从眼位到目标躯干通视吗（装配层用 battlefield.Raycast 实现）
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.card = null;
    this.entity = null;
    this.hold = 0;
    /** 取证用：这一帧扫了几个候选、做了几次通视查询。 */
    this.stats = { candidates: 0, rays: 0 };
    this.slots = Array.from({ length: SLOTS }, () => ({
      entity: null, dist: 0, score: 0, x: 0, y: 0, z: 0,
    }));
    this.used = 0;
    this.point = { x: 0, y: 0, z: 0 };
  }

  Clear() {
    this.card = null;
    this.entity = null;
    this.hold = 0;
  }

  /**
   * 每帧一次。detail 为 false（写实档）时整条链直接短路 —— 不扫、不投射、不留卡片。
   *
   * @param {number} dt
   * @param {object} ctx { eye, dir, soldiers, extras, detail, spreadDeg, rangeM }
   *   extras：非人目标（载具、固定火力点）。字段契约见 TargetCard 的 vehicle 分支：
   *   { kind, id, side, title, meta, x, y, z, radiusM, health01 }。
   *   战车系统落地时把车按这个形状挂进来即可，识别层不必改。
   */
  Update(dt, {
    eye = null, dir = null, soldiers = [], extras = [],
    detail = "basic", spreadDeg = 0, rangeM = IDENTIFY.rangeM,
  } = {}) {
    if (!detail || !eye || !dir) {
      // 这一帧真的什么都没做：取证口读的就是这两个数，别留上一帧的残值。
      this.stats.candidates = 0;
      this.stats.rays = 0;
      this.Clear();
      return null;
    }
    const found = this.Pick(eye, dir, soldiers, extras, spreadDeg, rangeM);
    if (found) {
      this.entity = found.entity;
      this.card = TargetCard(found.entity, found.dist, detail);
      this.hold = IDENTIFY.holdS;
      return this.card;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.Clear();
    }
    return this.card;
  }

  /** 锥内排名 + 通视校验。返回 { entity, dist } 或 null。 */
  Pick(eye, dir, soldiers, extras, spreadDeg, rangeM) {
    // 锥至少与散布同宽：准心画多大，识别就认多宽（见文件头的账）。
    const coneTan = Math.tan(Math.max(IDENTIFY.coneDeg, spreadDeg || 0) * Math.PI / 360);
    this.used = 0;
    this.stats.candidates = 0;
    this.stats.rays = 0;

    const Consider = (entity, x, y, z, halfW, halfH, maxRange) => {
      const rx = x - eye.x, ry = y - eye.y, rz = z - eye.z;
      const t = rx * dir.x + ry * dir.y + rz * dir.z;
      if (t < IDENTIFY.minRangeM || t > maxRange) return;
      // 到瞄准射线的垂距，拆成"横着差多少"与"竖着差多少"分别按胶囊尺寸归一。
      const px = rx - dir.x * t, py = ry - dir.y * t, pz = rz - dir.z * t;
      const cone = Math.min(IDENTIFY.coneCapM, t * coneTan);
      const reachW = Math.max(halfW, cone);
      const reachH = Math.max(halfH, cone);
      const horiz = Math.sqrt(px * px + pz * pz);
      const n = Math.hypot(horiz / reachW, py / reachH);
      if (n > 1) return;
      this.stats.candidates += 1;
      // 对得越准排越前；同样准就取近的（远处那个多半只是恰好在同一条线上）。
      const score = n + t / (maxRange * 40);
      this.Insert(entity, t, score, x, y, z);
    };

    for (const s of soldiers) {
      if (!s || !s.alive) continue;
      const body = CAPSULE[s.stance] || CAPSULE[0];
      Consider(s, s.position.x, s.position.y + body.y, s.position.z,
        BODY_HALF_W, body.halfH, rangeM);
    }
    for (const e of extras) {
      if (!e) continue;
      const half = Math.max(BODY_HALF_W, e.radiusM || 0);
      Consider(e, e.x, e.y, e.z, half, Math.max(half, e.halfHeightM || 0), rangeM);
    }
    // 活人（和车）优先。地上的尸体只在没有活目标时才认，而且只认近处的。
    if (this.used === 0) {
      for (const s of soldiers) {
        if (!s || s.alive) continue;
        Consider(s, s.position.x, s.position.y + CAPSULE[2].y, s.position.z,
          BODY_HALF_W, CAPSULE[2].halfH, IDENTIFY.corpseRangeM);
      }
    }

    for (let i = 0; i < this.used; i += 1) {
      const slot = this.slots[i];
      if (this.hooks.Clear) {
        this.point.x = slot.x; this.point.y = slot.y; this.point.z = slot.z;
        this.stats.rays += 1;
        if (!this.hooks.Clear(eye, this.point)) continue;
      }
      return { entity: slot.entity, dist: slot.dist };
    }
    return null;
  }

  /** 按 score 插进前 SLOTS 名。槽位预分配，扫一整条战线也不产生垃圾。 */
  Insert(entity, dist, score, x, y, z) {
    if (this.used === SLOTS && score >= this.slots[SLOTS - 1].score) return;
    let at = Math.min(this.used, SLOTS - 1);
    while (at > 0 && this.slots[at - 1].score > score) {
      const from = this.slots[at - 1];
      const to = this.slots[at];
      to.entity = from.entity; to.dist = from.dist; to.score = from.score;
      to.x = from.x; to.y = from.y; to.z = from.z;
      at -= 1;
    }
    const slot = this.slots[at];
    slot.entity = entity; slot.dist = dist; slot.score = score;
    slot.x = x; slot.y = y; slot.z = z;
    if (this.used < SLOTS) this.used += 1;
  }
}
