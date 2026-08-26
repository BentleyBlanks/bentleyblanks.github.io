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

export const IDENTIFY = {
  /**
   * 识别距离上限。**这个数由眼睛定，不由步枪射程定。**
   *
   * 【2026-08-26 从 130 收到 60】用户实拍反馈：野外一个 95 m 外的日军也报出了
   * 「日军 步兵 · 三八式」——「怎么会有这么远的也能看到是什么东西？不合理」。
   * 这条成立：95 m 上那个人在屏幕上只有十几个像素高，雾又吃掉八成对比
   * （fog = 1 − exp(−d × density)，0.0150 档在 95 m 上是 0.76），
   * 玩家自己看到的只是一个人影 —— 名牌把"那儿有个人影"变成"那是个三八式步枪兵"，
   * 那不是 HUD，那是透视挂。
   *
   * 60 m 这个数对着 Script_Actor 顶部那本账定：70 m 上雾已经把敌我的反照率差
   * 吃到噪声水平（|韦伯| 0.020—0.035），也就是**再往外玩家连敌我都分不出**。
   * 所以识别只在"你还看得见一个人形、但读不出他是谁"的那一段里帮忙，
   * 越过这一段就什么也不说。（中正式打得到 500 m，别拿射程来改它。）
   */
  rangeM: 60,
  /**
   * 报得出军衔与番号的距离。再往外只报阵营与距离。
   * 30 m 上一个人占屏幕约 55 px 高，肩章领章是能分辨的量级；
   * 60 m 上只剩 27 px，那时候还报出"军曹·步兵第63联队"就是在编。
   */
  detailRangeM: 30,
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

/**
 * 日军军衔。**1938 年没有"兵长"** —— 那一级是 1940 年才加的，别往表里填。
 * 这一版用得到的自下而上是：二等兵 → 一等兵 → 上等兵 → 伍长 → 军曹。
 *
 * 挂在战术角色与手里那件家伙上：分队长是军曹，重机枪组长按伍长算，
 * 轻机枪手（歪把子）通常是上等兵，其余按出生序号在二等兵/一等兵之间分。
 */
function IjaRank(soldier) {
  if (soldier.weaponId === "Type92Hmg") return "伍长";
  if (soldier.weaponId === "Type89Launcher") return "上等兵";
  if (soldier.weapon?.kind === "lmg") return "上等兵";
  if (soldier.tacticalRole === "leader") return "军曹";
  return (Number(soldier.id) % 3 === 0) ? "一等兵" : "二等兵";
}

/**
 * 部队番号。滕县这一仗打进来的是第 10 师团**濑谷支队**，
 * 步兵骨干是步兵第 63 联队与步兵第 10 联队（见 docs/Data_HistoryMaterial.md 第二节）。
 * 重机枪按联队直属的机关枪中队报。
 *
 * 为什么报番号而不报枪：玩家真正要读的是"对面是哪一支、成建制到什么程度"，
 * 而"他拿的是三八式"这件事在这个战场上是废话 —— 日军步兵人手一支三八式。
 */
const IJA_REGIMENTS = ["步兵第63联队", "步兵第10联队"];

function IjaUnit(soldier) {
  if (soldier.weaponId === "Type92Hmg") return "机关枪中队";
  if (soldier.weaponId === "Type89Launcher") return "掷弹筒分队";
  // 按 id 定死，不随帧变：同一个人每次指到他都该是同一支部队。
  return IJA_REGIMENTS[Math.abs(Number(soldier.id) || 0) % IJA_REGIMENTS.length];
}

function Meters(dist) {
  return `${Math.max(1, Math.round(dist))}m`;
}

/**
 * 年龄。**只有自己人给**，而且它是自己人那张卡上唯一的"内容"。
 *
 * 为什么把枪换成岁数：准心压在弟兄身上时，玩家要读的从来不是"他拿的什么枪"——
 * 那既不改变他要做的事（不打他），也不改变他能做的事。而这支部队是川军，
 * MakeSoldierIdentity 抽出来的是 17—34 岁，队伍里三成不到二十。
 * 「十八岁 · 12m」把"我在替谁挡这一枪"这件事说清楚，而"汉阳造 · 12m"什么也没说。
 * 日军不给：他的岁数玩家不该知道，那是准心不该越过的一条线。
 */
function Years(identity) {
  const age = Math.round(Number(identity?.age));
  return Number.isFinite(age) && age > 0 ? `${age} 岁` : "";
}

/**
 * 把一个目标做成 HUD 直接能画的卡片。纯函数。
 *
 * detail：
 *   "full"  —— 体验档：连血条一起给。
 *   "basic" —— 标准档：敌人给军衔与番号，自己人给姓名与岁数，一律带距离；
 *                伤情只给"负伤"两个字，不给数字。
 *   false   —— 写实档：这一层根本不跑（见 IdentifySystem.Update）。
 *
 * **远近分两级**（2026-08-26）：超过 IDENTIFY.detailRangeM 只报阵营与距离。
 * 军衔要看领章、番号要看人认得出这支部队，三十米外这两样都读不出来 ——
 * 那一段玩家真正需要、也真正读得到的只有一件事：**那是敌是友**。
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
  const faction = entity.side === "nra" ? "nra" : "ija";

  if (!entity.alive) {
    // **日军的尸体不给卡片**（2026-08-26）。原来那张写着「日军 阵亡 · 2m」——
    // 两样都是废话：玩家刚打死他，知道他是日军；他就躺在脚边，也知道有两米。
    // 阵亡卡存在的理由是"把这是谁写在战场上"，而日方本来就不给姓名，
    // 于是那张卡片只剩一个标签，纯粹是低头走路时糊在准心下的噪声。
    // 能不能捡他的枪由 F 的提示语在两米内说，那一条与这张卡片无关。
    if (faction !== "nra") return null;
    // 川军的阵亡卡照旧：他仍然有名有姓 —— 这一版唯一一处把"这是谁"写在战场上的
    // 地方就是这里。地上那具已经是个物件了，所以**不报他的枪**，
    // 只留他是谁、哪里人、多大、有多远（见 Years 的账）。
    const bits = [identity.origin, Years(identity), Meters(dist)];
    return {
      key: `s${entity.id}`,
      faction,
      kind: "corpse",
      title: `阵亡 ${identity.name || ""}`.trim(),
      meta: bits.filter(Boolean).join(" · "),
      health: null,
      dead: true,
    };
  }

  const wounded = Number(entity.health) <= 55;
  if (dist > IDENTIFY.detailRangeM) {
    // 远处：只认得出敌我，认不出是谁。血条也不给 —— 三十米外看不出他伤没伤。
    return {
      key: `s${entity.id}`,
      faction,
      kind: faction === "nra" ? "friend" : "enemy",
      title: FACTION_LABEL[faction],
      meta: Meters(dist),
      health: null,
      dead: false,
      distant: true,
    };
  }
  if (faction === "nra") {
    // 自己人这一行**不报枪**，报岁数（见 Years 的账）。
    const bits = [entity.towel ? "敢死队" : "", Years(identity), Meters(dist)];
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

  // 活着的日军：**军衔 + 部队番号**，不报他手里那支枪 ——
  // 日军步兵人手一支三八式，报枪等于没报；番号才是"对面是哪一支"。
  const bits = [IjaUnit(entity), Meters(dist)].filter(Boolean);
  if (detail !== "full" && wounded) bits.push("负伤");
  return {
    key: `s${entity.id}`,
    faction,
    kind: "enemy",
    title: `${FACTION_LABEL.ija} ${IjaRank(entity)}`,
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
    // **日军的尸体连扫都不扫** —— TargetCard 对它返回 null（见那儿的账），
    // 扫进来只会白占一个候选名额、白投一条通视射线，还会把它下面那个
    // 真该认出来的自己人挤掉。
    if (this.used === 0) {
      for (const s of soldiers) {
        if (!s || s.alive || s.side !== "nra") continue;
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
