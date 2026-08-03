import { CHAPTERS, PROLOGUE_PANELS, SAVE_KEY } from "./Data_Story.mjs";
import {
  AIR,
  CarveCell,
  GetCell,
  RebuildTunnelSolids,
  SetCell,
  SOFT,
} from "./Script_Dig.mjs";
import {
  ClearPlanCell,
  CountPlanned,
  EnsurePlanGrid,
  InitPlanCursor,
  IsPlanned,
  MovePlanCursor,
  PickExcavateTarget,
  StampChamberPlan,
  StampCorridorPlan,
  TogglePlanCell,
} from "./Script_Plan.mjs";
import {
  CanDigWith,
  CanPlant,
  CanShoot,
  CanThrow,
  ITEM_AMMO,
  ITEM_CHARGE,
  ITEM_GRENADE,
  ITEM_NONE,
  ITEM_RIFLE,
  ITEM_SHOVEL,
  PickupEntity,
} from "./Script_Items.mjs";
import { BuildLevel, EvalDigGoals, SURFACE_Y, VIEW_W } from "./Script_World.mjs";

export const PLAYER_W = 26;
export const PLAYER_H = 48;
export const GRAVITY = 1850;
export const MOVE_SPEED = 220;
export const THROW_SPEED = 420;

export function CreateInputState() {
  return {
    left: false,
    right: false,
    up: false,
    dig: false,
    digPressed: false,
    interact: false,
    interactPressed: false,
    use: false,
    usePressed: false,
    drop: false,
    dropPressed: false,
    crouch: false,
    /** Hold to ADS when rifle is in hand. */
    aim: false,
    designTogglePressed: false,
    planPaintPressed: false,
    planErasePressed: false,
    planChamberPressed: false,
    planCorridorPressed: false,
  };
}

export function CreateCampaignState(chapterIndex = 0, progress = null) {
  const idx = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex | 0));
  const chapter = CHAPTERS[idx];
  const level = BuildLevel(chapter.id);
  if (level.soil) EnsurePlanGrid(level.soil);
  const tunnel = !!level.spawn.tunnel;
  const loadout = level.spawnLoadout || {};
  return {
    phase: "title",
    panelIndex: 0,
    chapterIndex: idx,
    chapterId: chapter.id,
    goalsDone: Object.fromEntries(chapter.goals.map((g) => [g, false])),
    unlockedActs: progress?.unlockedActs || 1,
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      crouching: false,
      aiming: false,
      digging: false,
      digProgress: 0,
      digTarget: null,
      /** Valiant Hearts: one carried item at a time — not a backpack. */
      held: loadout.held ?? ITEM_NONE,
      /** Pocket ammo — separate from held slot (rifle consumes this). */
      ammo: loadout.ammo ?? 0,
      shotCool: 0,
      hp: 3,
      invuln: 0,
      inTunnel: tunnel,
    },
    projectiles: [],
    designMode: false,
    planCursor: level.soil ? InitPlanCursor(level.soil, level.spawn.x, level.spawn.y, 1) : null,
    cameraX: Math.max(0, level.spawn.x - VIEW_W * 0.35),
    cameraY: tunnel ? level.tunnelFloor - 300 : SURFACE_Y - 360,
    level,
    interactHint: "",
    /** Valiant Hearts-style bubble: { icons: string[], mutter?: string, timer } */
    bubble: null,
    subtitle: null,
    subtitleTimer: 0,
    /** Film beats queued after key moments (e.g. 高老忠殉钟). */
    subtitleQueue: [],
    winTimer: 0,
    failed: false,
    completed: false,
    pauseOpen: false,
    transition: 0,
    input: CreateInputState(),
    stats: { digs: 0, interactions: 0, shots: 0, kills: 0, cellsCarved: 0, pickups: 0 },
    muzzle: null,
  };
}

export function PlayerAabb(player) {
  const h = player.crouching ? PLAYER_H * 0.7 : PLAYER_H;
  return { x: player.x - PLAYER_W / 2, y: player.y - h, w: PLAYER_W, h };
}

export function RectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function SolidsFor(state) {
  return state.player.inTunnel ? state.level.tunnelSolids : state.level.surfaceSolids;
}

function ResolvePhysics(state, dt) {
  const { player, input, level } = state;
  if (state.transition > 0) return;

  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.crouching = !!input.crouch && player.onGround && !input.dig;
  player.aiming = !!input.aim && CanShoot(player.held) && !state.designMode && !player.inTunnel;
  let speed = MOVE_SPEED;
  if (player.crouching) speed *= 0.55;
  if (player.aiming) speed *= 0.32;
  player.vx = move * speed;
  if (move && !player.aiming) player.facing = move;
  if (player.shotCool > 0) player.shotCool = Math.max(0, player.shotCool - dt);
  // No Mario jump — Valiant Hearts traversal is walk / crawl / dig / hatch.

  player.vy += GRAVITY * dt;

  player.x += player.vx * dt;
  player.x = Math.max(20, Math.min(level.width - 20, player.x));
  let aabb = PlayerAabb(player);
  for (const s of SolidsFor(state)) {
    if (!RectsOverlap(aabb, s)) continue;
    if (player.vx > 0) player.x = s.x - PLAYER_W / 2;
    else if (player.vx < 0) player.x = s.x + s.w + PLAYER_W / 2;
    else {
      const mid = s.x + s.w / 2;
      player.x = player.x < mid ? s.x - PLAYER_W / 2 : s.x + s.w + PLAYER_W / 2;
    }
    aabb = PlayerAabb(player);
  }

  const prevY = player.y;
  player.y += player.vy * dt;
  aabb = PlayerAabb(player);
  player.onGround = false;
  for (const s of SolidsFor(state)) {
    if (!RectsOverlap(aabb, s)) continue;
    if (player.vy >= 0 && prevY <= s.y + 6) {
      player.y = s.y;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && prevY - aabb.h >= s.y + s.h - 6) {
      player.y = s.y + s.h + aabb.h;
      player.vy = 0;
    }
    aabb = PlayerAabb(player);
  }

  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
}

function Near(player, ent, radius = 48) {
  const ex = ent.x + (ent.w || 28) / 2;
  const r = ent.radius || radius;
  if (ent.type === "hatch" || ent.layer === "both") return Math.abs(player.x - ex) < r;
  // Tunnel props sit on a dig floor that can jitter under gravity — match on X.
  if (ent.tunnelAnchored || ent.type === "plant_zone" || ent.kind === "pickup") {
    return Math.abs(player.x - ex) < r;
  }
  return Math.hypot(player.x - ex, player.y - ent.y) < r;
}

function LayerOk(player, ent) {
  if (ent.layer === "both") return true;
  if (ent.layer === "tunnel") return !!player.inTunnel;
  if (ent.layer === "surface") return !player.inTunnel;
  return true;
}

function MarkGoal(state, goalId) {
  if (!Object.prototype.hasOwnProperty.call(state.goalsDone, goalId)) return;
  if (state.goalsDone[goalId]) return;
  state.goalsDone[goalId] = true;
  // Soft pictogram ping — never a "quest complete" banner
  const icon = GoalIcon(goalId);
  if (icon) SetBubble(state, [icon, "check"], "", 1.4);
}

function GoalIcon(goalId) {
  if (goalId.startsWith("link_") || goalId.startsWith("dig_")) return "shovel";
  if (goalId.includes("bell")) return "bell";
  if (goalId.includes("hatch") || goalId.includes("enter") || goalId.includes("shaft")) return "hatch";
  if (goalId.includes("shelter")) return "people";
  if (goalId.includes("flip") || goalId.includes("trap") || goalId.includes("spy")) return "flip";
  if (goalId.includes("shot") || goalId.includes("patrol") || goalId.includes("kill")) return "shot";
  if (goalId.includes("charge") || goalId.includes("signal")) return "charge";
  if (goalId.includes("talk")) return "talk";
  return "check";
}

function SetBubble(state, icons, mutter = "", time = 2.8) {
  state.bubble = { icons: icons || [], mutter, timer: time };
  if (mutter) {
    const prev = state.subtitle;
    state.subtitle = {
      speaker: prev && prev.text === mutter && prev.speaker ? prev.speaker : prev?.speaker || "",
      text: mutter,
    };
    state.subtitleTimer = time;
  }
}

function SetSubtitle(state, speaker, text, time = 4.8) {
  const icons = GuessIcons(speaker, text);
  state.subtitle = { speaker: speaker || "", text };
  state.subtitleTimer = time;
  state.bubble = { icons, mutter: text, timer: time };
}

function QueueSubtitles(state, beats) {
  if (!Array.isArray(beats) || !beats.length) return;
  state.subtitleQueue = (state.subtitleQueue || []).concat(beats);
  if (!state.subtitle || state.subtitleTimer <= 0) DrainSubtitleQueue(state);
}

function DrainSubtitleQueue(state) {
  const q = state.subtitleQueue;
  if (!q || !q.length) return;
  const next = q.shift();
  SetSubtitle(state, next.speaker || "", next.text || "", next.time ?? 3.2);
}

function AdvanceTalk(state, ent) {
  const script = ent.script || (ent.line ? [{ speaker: ent.speaker || "？", text: ent.line }] : []);
  if (!script.length) {
    ent.done = true;
    return;
  }
  const idx = ent.scriptIndex | 0;
  const beat = script[idx];
  SetSubtitle(state, beat.speaker || ent.speaker || "", beat.text, 6.5);
  ent.scriptIndex = idx + 1;
  if (ent.scriptIndex >= script.length) {
    ent.done = true;
    if (ent.goal) MarkGoal(state, ent.goal);
  }
}

function GuessIcons(speaker, text) {
  const t = `${speaker}|${text}`;
  if (/挖|铁锨|软土|土洞|地窖/.test(t)) return ["shovel"];
  if (/钟/.test(t)) return ["bell"];
  if (/井|地道口|下到|回到地面/.test(t)) return ["hatch"];
  if (/翻口/.test(t)) return ["flip"];
  if (/特务|武工/.test(t)) return ["talk", "warn"];
  if (/打一枪|出击|鬼子|开枪|杀掉|干掉/.test(t)) return ["shot"];
  if (/药|炸药|总攻/.test(t)) return ["charge"];
  if (/乡亲|进洞|孩子/.test(t)) return ["people"];
  if (/发现|危险|蹲/.test(t)) return ["warn"];
  if (/还没挖|挖到位/.test(t)) return ["shovel", "warn"];
  return ["talk"];
}

function SyncDigGoals(state) {
  const evaled = EvalDigGoals(state.level);
  for (const [goal, ok] of Object.entries(evaled)) {
    if (ok) MarkGoal(state, goal);
  }
  // Ensure link endpoints become AIR once their zone is satisfied
  for (const zone of state.level.digZones || []) {
    if (!state.goalsDone[zone.goal]) continue;
    const cc = zone.c + Math.floor(zone.w / 2);
    const rr = zone.r + Math.floor(zone.h / 2);
    SetCell(state.level.soil, cc, rr, AIR);
  }
}

function TryDesign(state) {
  const { player, level, input } = state;
  if (!player.inTunnel || !level.soil || state.transition > 0) {
    if (input.designTogglePressed && player.inTunnel === false) {
      SetSubtitle(state, "设计", "下到地窖里才能设计地道蓝图。", 2.4);
    }
    return;
  }
  if (input.designTogglePressed) {
    state.designMode = !state.designMode;
    if (state.designMode) {
      EnsurePlanGrid(level.soil);
      state.planCursor = InitPlanCursor(level.soil, player.x, player.y, player.facing);
      SetSubtitle(state, "设计", "蓝图模式：方向键移光标，J 标记/取消，T 厢室，C 巷道。再按 R 退出，走到蓝图旁点 J 开挖。", 5.5);
    } else {
      const n = CountPlanned(level.soil);
      SetSubtitle(state, "设计", n ? `蓝图 ${n} 格已定——走到标记旁点 J 开挖（不是长按）。` : "已退出设计。先画蓝图再挖。", 3.5);
    }
  }
  if (!state.designMode || !state.planCursor) return;

  let dc = 0;
  let dr = 0;
  if (input.left) dc -= 1;
  if (input.right) dc += 1;
  if (input.up) dr -= 1;
  if (input.crouch) dr += 1;
  state._planMoveCd = (state._planMoveCd || 0) - 1 / 30;
  if ((dc || dr) && state._planMoveCd <= 0) {
    state.planCursor = MovePlanCursor(level.soil, state.planCursor, dc, dr);
    if (dc) player.facing = dc > 0 ? 1 : -1;
    state._planMoveCd = 0.12;
  }

  const cur = state.planCursor;
  if (input.planPaintPressed || input.digPressed) {
    const res = TogglePlanCell(level.soil, cur.c, cur.r);
    if (res === "mark") SetBubble(state, ["shovel"], "标记开挖", 0.8);
    else if (res === "erase") SetBubble(state, ["warn"], "取消标记", 0.8);
    else SetBubble(state, ["shovel", "warn"], "须从已有空洞或蓝图延伸", 1.4);
  }
  if (input.planErasePressed) {
    if (ClearPlanCell(level.soil, cur.c, cur.r)) SetBubble(state, ["warn"], "擦除", 0.6);
  }
  if (input.planChamberPressed) {
    const n = StampChamberPlan(level.soil, cur.c, cur.r, 2, 2);
    SetSubtitle(state, "设计", n ? `厢室蓝图 +${n} 格` : "此处无法铺厢室——靠近已有洞或蓝图", 2.2);
  }
  if (input.planCorridorPressed) {
    const face = player.facing >= 0 ? 1 : -1;
    const n = StampCorridorPlan(level.soil, cur.c, cur.r, face, 5);
    SetSubtitle(state, "设计", n ? `巷道蓝图 +${n} 格` : "巷道延伸失败——换方向或先连上气口", 2.2);
  }
}

function TryExcavate(state) {
  const { player, level, input } = state;
  player.digging = false;
  player.digTarget = null;
  if (state.designMode) return;
  if (!input.digPressed || !player.inTunnel || !level.soil || state.transition > 0) return;
  if (!CanDigWith(player.held)) {
    state.interactHint = "need_shovel";
    SetBubble(state, ["shovel", "warn"], "先捡起铁锹", 1.6);
    return;
  }
  EnsurePlanGrid(level.soil);
  const digUp = !!input.up;
  const digDown = !!input.crouch;
  const dig = PickExcavateTarget(level.soil, player.x, player.y, player.facing, digDown, digUp);
  if (!dig) {
    const planned = CountPlanned(level.soil);
    if (planned > 0) {
      SetSubtitle(state, "提示", "蓝图已画好——走到蓝色格子旁边，再点 J 开挖。", 2.8);
      state.interactHint = "follow_plan";
    } else {
      SetSubtitle(state, "提示", "先按 R 进入设计，把要挖的格子标成蓝图，再点 J 开挖。不能长按乱挖。", 3.2);
      state.interactHint = "need_plan";
    }
    return;
  }
  player.digTarget = dig;
  state.interactHint = "dig";
  if (CarveCell(level.soil, dig.c, dig.r)) {
    state.stats.digs += 1;
    state.stats.cellsCarved += 1;
    // One tap also clears planned headroom — player is ~2 cells tall.
    const headR = dig.r - 1;
    if (IsPlanned(level.soil, dig.c, headR) && GetCell(level.soil, dig.c, headR) === SOFT) {
      if (CarveCell(level.soil, dig.c, headR)) state.stats.cellsCarved += 1;
    }
    const footR = dig.r + 1;
    if (IsPlanned(level.soil, dig.c, footR) && GetCell(level.soil, dig.c, footR) === SOFT) {
      if (CarveCell(level.soil, dig.c, footR)) state.stats.cellsCarved += 1;
    }
    RebuildTunnelSolids(level);
    SyncDigGoals(state);
    SetBubble(state, ["shovel"], "开挖", 0.7);
  }
}


function MakeDroppedPickup(player, itemId, side = 1) {
  const p = PickupEntity(player.x + player.facing * 28 * side, player.inTunnel ? player.y : SURFACE_Y, itemId);
  p.layer = player.inTunnel ? "tunnel" : "surface";
  return p;
}

function DropHeld(state) {
  const { player, level } = state;
  if (!player.held) return;
  const itemId = player.held;
  player.held = ITEM_NONE;
  level.entities.push(MakeDroppedPickup(player, itemId, 1));
  SetBubble(state, [itemId === ITEM_SHOVEL ? "shovel" : itemId === ITEM_CHARGE ? "charge" : "warn"], "放下", 1.0);
}

function TryPickupOrInteract(state) {
  const { player, level, input } = state;
  if (!input.interactPressed || state.transition > 0) return false;

  // Prefer world pickups — one-item carry, swap if hands full
  for (const ent of level.entities) {
    if (ent.kind !== "pickup" || ent.taken) continue;
    if (!LayerOk(player, ent)) continue;
    if (!Near(player, ent, 46)) continue;
    // Ammo packs fill the pocket — never occupy the held slot.
    if (ent.itemId === ITEM_AMMO) {
      const add = ent.ammoAmount || 3;
      player.ammo = (player.ammo || 0) + add;
      ent.taken = true;
      ent.hidden = true;
      state.stats.pickups += 1;
      SetBubble(state, ["shot"], `+${add}发`, 1.2);
      SetSubtitle(state, "提示", `装上 ${add} 发子弹（现有 ${player.ammo}）。`, 2.0);
      return true;
    }
    const previous = player.held;
    player.held = ent.itemId;
    ent.taken = true;
    ent.hidden = true;
    state.stats.pickups += 1;
    if (previous) {
      level.entities.push(MakeDroppedPickup(player, previous, -1));
    }
    const icon =
      ent.itemId === ITEM_SHOVEL
        ? "shovel"
        : ent.itemId === ITEM_CHARGE
          ? "charge"
          : ent.itemId === ITEM_RIFLE
            ? "shot"
            : "warn";
    SetBubble(state, [icon], "", 1.2);
    return true;
  }
  return false;
}

function AlertEnemiesNear(state, x, radius, alertTime = 4.2) {
  for (const e of state.level.entities) {
    if (e.type !== "enemy" || e.dead) continue;
    if (Math.abs(e.x - x) < radius) {
      e.alert = Math.max(e.alert || 0, alertTime);
      e.alertX = x;
    }
  }
}

function FireRifle(state) {
  const { player } = state;
  if ((player.shotCool || 0) > 0) return;
  if (!CanShoot(player.held)) return;
  if ((player.ammo || 0) <= 0) {
    state.interactHint = "need_ammo";
    SetBubble(state, ["shot", "warn"], "没子弹", 1.4);
    SetSubtitle(state, "提示", "弹药空了——去捡子弹，或摸到背后用 E 击晕。", 2.6);
    return;
  }
  player.ammo -= 1;
  player.shotCool = player.aiming ? 0.62 : 0.38;
  state.stats.shots += 1;
  const facing = player.facing || 1;
  const range = player.aiming ? 440 : 210;
  state.muzzle = {
    x: player.x + facing * (player.aiming ? 28 : 22),
    y: (player.y || SURFACE_Y) - (player.crouching ? 28 : 38),
    timer: 0.16,
    facing,
  };

  const living = state.level.entities.filter((e) => e.type === "enemy" && !e.dead && LayerOk(player, e));
  let best = null;
  let bestD = range;
  for (const e of living) {
    const dx = e.x - player.x;
    if (facing > 0 && dx < 8) continue;
    if (facing < 0 && dx > -8) continue;
    const d = Math.abs(dx);
    if (d < bestD && Math.abs((e.y || 0) - player.y) < 56) {
      bestD = d;
      best = e;
    }
  }
  // Gunshot always draws attention.
  AlertEnemiesNear(state, player.x, player.aiming ? 380 : 300, 5.0);
  if (!best) {
    SetSubtitle(state, "高传宝", player.aiming ? "开镜——没打中。" : "打空了。", 1.4);
    return;
  }
  const dmg = player.aiming ? 2 : 1;
  const killed = HurtEnemy(state, best, dmg);
  if (killed) SetSubtitle(state, "高传宝", player.aiming ? "开镜打中——倒了。" : "打倒一个！", 1.8);
  else SetSubtitle(state, "高传宝", "打中了！快补枪或换位。", 1.6);
}

function TryUseItem(state) {
  const { player, level, input } = state;
  if (!input.usePressed || state.transition > 0) return;

  if (CanShoot(player.held)) {
    FireRifle(state);
    return;
  }

  if (CanThrow(player.held)) {
    state.projectiles.push({
      kind: "grenade",
      x: player.x + player.facing * 20,
      y: player.y - 28,
      vx: player.facing * THROW_SPEED,
      vy: -220,
      life: 1.4,
    });
    player.held = ITEM_NONE;
    SetBubble(state, ["warn"], "", 0.8);
    AlertEnemiesNear(state, player.x, 260, 3.5);
    return;
  }

  if (CanPlant(player.held)) {
    for (const ent of level.entities) {
      if (ent.type !== "plant_zone" || ent.done) continue;
      if (!LayerOk(player, ent)) continue;
      if (!Near(player, ent, ent.radius || 56)) continue;
      if (!GoalReady(state, ent)) {
        SetBubble(state, ["shovel", "warn"], "", 1.6);
        return;
      }
      ent.done = true;
      player.held = ITEM_NONE;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "高传宝", "药室安好。回地面发信号！", 2.8);
      return;
    }
    SetBubble(state, ["charge", "warn"], "到药室再安放", 1.6);
  }
}

function DropEnemyLoot(state, ent) {
  if (ent.lootDropped) return;
  ent.lootDropped = true;
  const layer = ent.layer || "surface";
  if (ent.dropAmmo) {
    const p = PickupEntity(ent.x + 10, ent.y || SURFACE_Y, ITEM_AMMO, { ammoAmount: ent.dropAmmo });
    p.layer = layer;
    state.level.entities.push(p);
  }
  if (ent.dropRifle) {
    const p = PickupEntity(ent.x - 12, ent.y || SURFACE_Y, ITEM_RIFLE);
    p.layer = layer;
    state.level.entities.push(p);
  }
  if (ent.dropGrenade) {
    const p = PickupEntity(ent.x + 22, ent.y || SURFACE_Y, ITEM_GRENADE);
    p.layer = layer;
    state.level.entities.push(p);
  }
}

function HurtEnemy(state, ent, dmg) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  ent.hp -= dmg;
  ent.hurtFlash = 0.28;
  if (ent.hp <= 0) {
    ent.hp = 0;
    ent.dead = true;
    ent.corpse = true;
    state.stats.kills = (state.stats.kills || 0) + 1;
    DropEnemyLoot(state, ent);
    SyncKillGoals(state);
    return true;
  }
  return false;
}

/** Silent rear KO — works standing / crouching / aiming / any held item. */
function KnockOutEnemy(state, ent) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  ent.hp = 0;
  ent.dead = true;
  ent.ko = true;
  ent.corpse = true;
  ent.hurtFlash = 0.2;
  state.stats.kills = (state.stats.kills || 0) + 1;
  state.stats.stealthKos = (state.stats.stealthKos || 0) + 1;
  DropEnemyLoot(state, ent);
  SyncKillGoals(state);
  return true;
}

function EnemyFacing(ent) {
  if (ent.facing === 1 || ent.facing === -1) return ent.facing;
  return 1;
}

/** Player is close behind an enemy (facing away from player). */
function CanStealthKO(player, ent) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  if (!LayerOk(player, ent)) return false;
  const dx = player.x - ent.x;
  const face = EnemyFacing(ent);
  const behind = face > 0 ? dx < -10 : dx > 10;
  if (!behind) return false;
  if (Math.abs(dx) > 44) return false;
  if (Math.abs((player.y || 0) - (ent.y || 0)) > 48) return false;
  return true;
}

function RaiseCorpseAlarm(state, witness, body) {
  if (body.discovered) return;
  body.discovered = true;
  state.stats.alarms = (state.stats.alarms || 0) + 1;
  const line = witness.label === "伪军" ? "有尸体！快来人——！" : "死体だ！来い——！";
  SetSubtitle(state, witness.label || "敌兵", line, 2.8);
  SetBubble(state, ["warn"], "警戒", 1.4);
  for (const e of state.level.entities) {
    if (e.type !== "enemy" || e.dead) continue;
    e.highAlert = true;
    e.alert = Math.max(e.alert || 0, 7.5);
    e.alertX = body.x;
  }
  state.level.alarm = true;
}

function UpdateCorpseVision(state) {
  const foes = state.level.entities.filter((e) => e.type === "enemy");
  const corpses = foes.filter((e) => e.dead && e.corpse && !e.hidden);
  const living = foes.filter((e) => !e.dead);
  for (const foe of living) {
    const face = EnemyFacing(foe);
    for (const body of corpses) {
      if (body.discovered) continue;
      const dx = body.x - foe.x;
      if (Math.abs(dx) > 170) continue;
      if (Math.abs((body.y || 0) - (foe.y || 0)) > 50) continue;
      if (face > 0 && dx < 16) continue;
      if (face < 0 && dx > -16) continue;
      RaiseCorpseAlarm(state, foe, body);
      return;
    }
  }
}

function SyncKillGoals(state) {
  const foes = state.level.entities.filter((e) => e.type === "enemy");
  if (!foes.length) return;
  if (foes.every((e) => e.dead)) {
    MarkGoal(state, "kill_invaders");
    MarkGoal(state, "clear_street");
  }
}

function FireFromPort(state, port) {
  state.stats.shots += 1;
  const facing = state.player.facing || 1;
  state.muzzle = { x: port.x + facing * 18, y: SURFACE_Y - 38, timer: 0.2, facing };

  const living = state.level.entities.filter((e) => e.type === "enemy" && !e.dead);
  let best = null;
  let bestD = 280;
  for (const e of living) {
    const d = Math.abs(e.x - port.x);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  for (const e of living) {
    if (Math.abs(e.x - port.x) < 340) {
      e.alert = 2.8;
      e.alertX = port.x;
    }
  }
  if (!best) {
    SetSubtitle(state, "高传宝", "这口没鬼子。换口打！", 1.8);
    return;
  }
  const killed = HurtEnemy(state, best, 1);
  if (killed) {
    SetSubtitle(state, "高传宝", "干掉一个！打一枪换一个地方！", 2.2);
  } else {
    SetSubtitle(state, "高传宝", "打中了！快钻回去换地方！", 2.0);
  }
}

function UpdateProjectiles(state, dt) {
  const next = [];
  for (const p of state.projectiles || []) {
    p.vy += GRAVITY * 0.55 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      for (const ent of state.level.entities) {
        if (ent.type === "enemy" && !ent.dead) {
          if (Math.hypot(ent.x - p.x, (ent.y || 0) - p.y) < 78) {
            const killed = HurtEnemy(state, ent, 2);
            if (killed) SetSubtitle(state, "民兵", "手榴弹——好！", 1.8);
            else SetSubtitle(state, "民兵", "炸伤了！再补一枪！", 1.6);
          }
          continue;
        }
        if (ent.type !== "patrol" || ent.broken) continue;
        if (Math.hypot(ent.x - p.x, (ent.y || 0) - p.y) < 70) {
          ent.hits = (ent.hits || 0) + 2;
          if (ent.hits >= 3) {
            ent.broken = true;
            MarkGoal(state, "break_patrol");
          }
        }
      }
      continue;
    }
    next.push(p);
  }
  state.projectiles = next;
  if (state.muzzle) {
    state.muzzle.timer -= dt;
    if (state.muzzle.timer <= 0) state.muzzle = null;
  }
}

function BeginHatchTransition(state, goingDown, ent) {
  state.transition = 0.01;
  state._hatchDir = goingDown ? "down" : "up";
  state._hatchEnt = ent;
}

function FinishHatch(state) {
  const goingDown = state._hatchDir === "down";
  const ent = state._hatchEnt;
  state.player.inTunnel = goingDown;
  if (goingDown) {
    state.player.x = ent?.tunnelX ?? state.player.x;
    state.player.y = ent?.tunnelY ?? state.level.tunnelFloor;
  } else {
    state.player.y = SURFACE_Y;
  }
  state.player.vy = 0;
  state.player.onGround = true;
  SetBubble(state, goingDown ? ["hatch", "shovel"] : ["hatch"], "", 1.6);
}

function GoalReady(state, ent) {
  if (!ent.requiresGoal) return true;
  return !!state.goalsDone[ent.requiresGoal];
}

function TryInteract(state) {
  const { player, level, input } = state;
  if (!input.interactPressed || state.transition > 0) return;
  state.stats.interactions += 1;

  // Stealth rear KO — any stance / any held item, but never steal hatch/port/talk E.
  let nearWorldAction = false;
  for (const ent of level.entities) {
    if (ent.kind === "pickup" || ent.type === "enemy") continue;
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(player, ent)) continue;
    if (Near(player, ent, ent.radius || 52)) {
      nearWorldAction = true;
      break;
    }
  }
  if (!nearWorldAction) {
    for (const ent of level.entities) {
      if (ent.type !== "enemy" || ent.dead) continue;
      if (!CanStealthKO(player, ent)) continue;
      KnockOutEnemy(state, ent);
      SetBubble(state, ["warn"], "击晕", 0.9);
      SetSubtitle(state, "高传宝", "从背后制住。别让他们看见尸体。", 2.4);
      return;
    }
  }

  // Story / hatches / world actions before pickups — never let a shovel steal a talk.
  for (const ent of level.entities) {
    if (ent.kind === "pickup") continue;
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(player, ent)) continue;
    if (!Near(player, ent, ent.radius || 52)) continue;

    if (!GoalReady(state, ent) && ent.type !== "hatch" && ent.type !== "talk") {
      SetBubble(state, ["shovel", "warn"], "", 1.8);
      return;
    }

    if (ent.type === "talk") {
      AdvanceTalk(state, ent);
      return;
    }

    if (ent.type === "hatch") {
      // Going down into a tutorial hatch requires the shovel in hand.
      if (!player.inTunnel && ent.needsShovel && player.held !== ITEM_SHOVEL) {
        state.interactHint = "need_shovel";
        SetBubble(state, ["shovel", "warn"], "先捡铁锹", 1.6);
        SetSubtitle(state, "提示", "铁锹在井边。先捡上，再下洞挖。", 2.8);
        return;
      }
      BeginHatchTransition(state, !player.inTunnel, ent);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "shelter") {
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, ent.speaker || "乡亲", ent.line, 2.4);
      return;
    }

    if (ent.type === "bell") {
      // Film beat: 高老忠敲钟殉难 — player witnesses at the bell, does not “play as” the ringer.
      if (!state.goalsDone.shelter_a || !state.goalsDone.shelter_b || !state.goalsDone.shelter_c) {
        SetSubtitle(state, "高老忠", "先把人藏进洞——钟，我来敲！", 2.8);
        return;
      }
      if (ent.done) return;
      ent.done = true;
      ent.ringing = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      // Hold the scene — patrols must not cut the martyrdom beat short.
      player.invuln = Math.max(player.invuln, 22);
      QueueSubtitles(state, [
        { speaker: "高老忠", text: "乡亲们——快进洞！钟，我来敲！", time: 3.4 },
        { speaker: "旁白", text: "钟声裂开夜色。鬼子朝钟楼扑过来。", time: 3.2 },
        { speaker: "山田", text: "钟楼上有人——给我打！", time: 2.8 },
        { speaker: "高老忠", text: "有种的——过来！", time: 2.6 },
        { speaker: "旁白", text: "手榴弹的火光吞没钟架。高老忠用命，换全村进洞的时间。", time: 4.2 },
        { speaker: "高传宝", text: "叔——！", time: 2.6 },
      ]);
      return;
    }

    if (ent.type === "flip_build") {
      ent.done = true;
      for (const f of level.entities) if (f.type === "flip_trap") f.armed = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "林霞", "翻口好了。巷道再挖通到卡口。", 3.0);
      return;
    }

    if (ent.type === "spy_talk") {
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      for (const s of level.entities) if (s.type === "spy") s.exposed = true;
      SetSubtitle(state, "高传宝", "武工队从东沟来——你们怎么从炮楼方向进庄？", 3.5);
      return;
    }

    if (ent.type === "flip_trap") {
      if (!ent.armed) {
        SetSubtitle(state, "提示", "先改建翻口。", 2.0);
        return;
      }
      const spy = level.entities.find((e) => e.type === "spy" && e.exposed && !e.trapped);
      if (!spy || Math.abs(spy.x - ent.x) > 90) {
        SetSubtitle(state, "提示", "等特务走到翻口上方。", 2.0);
        return;
      }
      spy.trapped = true;
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "民兵", "翻口——上！", 2.6);
      return;
    }

    if (ent.type === "shot_port") {
      // Underground: sneak up. Surface: fire, then auto-retreat into the shaft.
      if (player.inTunnel) {
        BeginHatchTransition(state, false, ent);
        SetSubtitle(state, "高传宝", "悄悄出井……瞄准再打。", 2.0);
        return;
      }
      if ((ent.cool || 0) > 0) {
        BeginHatchTransition(state, true, ent);
        SetSubtitle(state, "林霞", "枪管还烫——先钻回去换口。", 1.8);
        return;
      }
      FireFromPort(state, ent);
      ent.cool = 1.6;
      BeginHatchTransition(state, true, ent);
      return;
    }

    if (ent.type === "plant_zone") {
      if (!CanPlant(player.held)) {
        SetBubble(state, ["charge", "warn"], "先拿着炸药包", 1.6);
        return;
      }
      // Planting is F / use — nudge player
      SetBubble(state, ["charge"], "按 F 安放", 1.4);
      return;
    }

    if (ent.type === "signal") {
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "赵平原", "总攻——黑风口！", 2.8);
      return;
    }
  }

  // Pickups last
  TryPickupOrInteract(state);
}

function UpdateActors(state, dt) {
  const { level, player } = state;
  for (const ent of level.entities) {
    if (ent.type === "shot_port" && (ent.cool || 0) > 0) {
      ent.cool = Math.max(0, ent.cool - dt);
    }
    if (ent.type === "spy" && ent.exposed && !ent.trapped) {
      const trap = level.entities.find((e) => e.type === "flip_trap");
      if (!trap) continue;
      ent.x += Math.sign(trap.x - ent.x) * 60 * dt;
    }
    if (ent.type === "enemy") {
      if (ent.hurtFlash > 0) ent.hurtFlash = Math.max(0, ent.hurtFlash - dt);
      if (ent.dead) continue;
      const prevX = ent.x;
      ent.t = (ent.t || 0) + dt;
      const high = !!ent.highAlert || !!level.alarm;
      if (ent.alert > 0) {
        ent.alert -= dt;
        const dir = Math.sign((ent.alertX ?? ent.homeX) - ent.x) || 1;
        ent.x += dir * (high ? 130 : 95) * dt;
        ent.facing = dir;
      } else {
        const phase = ent.phase || 0;
        const amp = ent.amp || 0;
        ent.x = ent.homeX + Math.sin(ent.t * 0.7 + phase) * amp;
        // Stationary guards keep authored facing (needed for rear-KO / corpse LOS).
        if (amp > 1) ent.facing = Math.cos(ent.t * 0.7 + phase) >= 0 ? 1 : -1;
      }
      if (Math.abs(ent.x - prevX) > 0.2) ent.facing = Math.sign(ent.x - prevX) || ent.facing || 1;
      if (!player.inTunnel && player.invuln <= 0) {
        // Surface contact / detection. High alert after corpse shout is much harsher.
        let detect = player.crouching ? 26 : 50;
        if (high) detect = player.crouching ? 52 : 100;
        // Harder to be seen from behind unless high alert.
        const dx = player.x - ent.x;
        const face = EnemyFacing(ent);
        const fromFront = face > 0 ? dx > 0 : dx < 0;
        if (!fromFront && !high) detect *= 0.45;
        if (Math.abs(player.x - ent.x) < detect && Math.abs(player.y - ent.y) < 42) {
          player.hp -= 1;
          player.invuln = 1.25;
          player.vx = Math.sign(player.x - ent.x || 1) * 200;
          ent.alert = Math.max(ent.alert || 0, 3.5);
          ent.alertX = player.x;
          SetSubtitle(
            state,
            "危险",
            high ? "高度警戒——被发现了！" : "被鬼子发现了——蹲下、绕背或钻井！",
            2.2,
          );
          if (player.hp <= 0) state.failed = true;
        }
      }
      continue;
    }
    if (ent.type === "patrol" && !ent.broken && ent.hostile) {
      ent.t = (ent.t || 0) + dt;
      ent.x = ent.homeX + Math.sin(ent.t * 0.65) * (ent.amp || 100);
      if (
        ent.barkYamada &&
        !ent._barked &&
        !player.inTunnel &&
        Math.abs(player.x - ent.x) < 220 &&
        !(state.subtitleQueue && state.subtitleQueue.length) &&
        !level.entities.some((e) => e.type === "bell" && e.ringing)
      ) {
        ent._barked = true;
        if (!state.subtitle || state.subtitleTimer < 0.4) {
          SetSubtitle(state, "山田", ent.barkYamada, 3.0);
        }
      }
      if (!player.inTunnel && player.invuln <= 0 && !player.crouching) {
        if (Math.abs(player.x - ent.x) < 38 && Math.abs(player.y - ent.y) < 40) {
          player.hp -= 1;
          player.invuln = 1.25;
          player.vx = Math.sign(player.x - ent.x || 1) * 180;
          SetSubtitle(state, "危险", "被发现了——蹲下或钻地道。", 2.2);
          if (player.hp <= 0) state.failed = true;
        }
      }
    }
  }
  if (state.subtitleTimer > 0) {
    state.subtitleTimer -= dt;
    if (state.subtitleTimer <= 0) {
      state.subtitle = null;
      state.bubble = null;
      DrainSubtitleQueue(state);
    }
  } else {
    DrainSubtitleQueue(state);
  }
  if (state.bubble) {
    state.bubble.timer -= dt;
    if (state.bubble.timer <= 0) state.bubble = null;
  }
  UpdateCorpseVision(state);
}

function UpdateCamera(state, dt) {
  const { player, level } = state;
  const targetX = player.x - VIEW_W * 0.38;
  state.cameraX += (Math.max(0, Math.min(level.width - VIEW_W, targetX)) - state.cameraX) * Math.min(1, dt * 6);
  const targetY = player.inTunnel ? player.y - 280 : SURFACE_Y - 360;
  state.cameraY += (targetY - state.cameraY) * Math.min(1, dt * 5);
}

function UpdateTransition(state, dt) {
  if (state.transition <= 0) return;
  state.transition += dt * 2.2;
  if (state.transition >= 0.5 && !state._hatchFlipped) {
    state._hatchFlipped = true;
    FinishHatch(state);
  }
  if (state.transition >= 1) {
    state.transition = 0;
    state._hatchFlipped = false;
    state._hatchEnt = null;
  }
}

function AllGoalsDone(state) {
  return Object.values(state.goalsDone).every(Boolean);
}

function RefreshHint(state) {
  if (state.player.digging) return;
  state.interactHint = "";
  for (const ent of state.level.entities) {
    if (ent.kind === "pickup" && !ent.taken && !ent.hidden) {
      if (!LayerOk(state.player, ent)) continue;
      if (Near(state.player, ent, 46)) {
        state.interactHint = "pickup";
        return;
      }
    }
  }
  for (const ent of state.level.entities) {
    if (ent.type === "enemy" && !ent.dead && CanStealthKO(state.player, ent)) {
      state.interactHint = "stealth_ko";
      return;
    }
  }
  for (const ent of state.level.entities) {
    if (ent.kind === "pickup") continue;
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(state.player, ent)) continue;
    if (Near(state.player, ent, ent.radius || 52)) {
      if (
        ent.type === "hatch" &&
        ent.needsShovel &&
        !state.player.inTunnel &&
        state.player.held !== ITEM_SHOVEL
      ) {
        state.interactHint = "need_shovel";
      } else {
        state.interactHint = ent.type;
      }
      return;
    }
  }
  if (CanShoot(state.player.held) && !state.player.inTunnel) {
    state.interactHint = state.player.ammo > 0 ? (state.player.aiming ? "ads" : "shoot") : "need_ammo";
    return;
  }
  if (state.designMode) {
    state.interactHint = "design";
    return;
  }
  if (state.player.inTunnel && state.level.soil) {
    if (!CanDigWith(state.player.held)) {
      state.interactHint = "need_shovel";
      return;
    }
    const dig = PickExcavateTarget(
      state.level.soil,
      state.player.x,
      state.player.y,
      state.player.facing,
      !!state.input.crouch,
      !!state.input.up,
    );
    if (dig) state.interactHint = "dig";
    else if (CountPlanned(state.level.soil) === 0) state.interactHint = "need_plan";
    else state.interactHint = "follow_plan";
  }
}

export function StepPlay(state, dt) {
  if (state.phase !== "play" || state.pauseOpen || state.failed || state.completed) return state;
  const clamped = Math.min(0.033, Math.max(0, dt));

  UpdateTransition(state, clamped);
  TryDesign(state);
  // Use / pick / talk before physics — standing in a fresh chamber can get
  // X-shoved by unresolved soil solids for a frame.
  if (state.input.dropPressed) DropHeld(state);
  TryUseItem(state);
  if (!state.designMode) TryInteract(state);
  // Excavate before physics — solids can shove the digger off the planned cell for a frame.
  TryExcavate(state);
  if (!state.designMode) ResolvePhysics(state, clamped);
  SyncDigGoals(state);
  RefreshHint(state);
  UpdateActors(state, clamped);
  UpdateProjectiles(state, clamped);
  UpdateCamera(state, clamped);

  if (AllGoalsDone(state) && !state.completed) {
    // Hold the win beat until film subtitle queues (殉钟等) finish playing.
    const queueBusy =
      (state.subtitleQueue && state.subtitleQueue.length > 0) || state.subtitleTimer > 0.05;
    if (!queueBusy) {
      state.winTimer += clamped;
      if (state.winTimer > 0.9) {
        state.completed = true;
        state.phase = "closePanels";
        state.panelIndex = 0;
        state.unlockedActs = Math.max(state.unlockedActs, state.chapterIndex + 2);
      }
    }
  } else state.winTimer = 0;

  state.input.interactPressed = false;
  state.input.usePressed = false;
  state.input.dropPressed = false;
  state.input.digPressed = false;
  state.input.designTogglePressed = false;
  state.input.planPaintPressed = false;
  state.input.planErasePressed = false;
  state.input.planChamberPressed = false;
  state.input.planCorridorPressed = false;
  return state;
}

function OpenPhaseFor(chapter) {
  return chapter.openPanels?.length ? "panels" : "play";
}

export function AdvancePanels(state) {
  if (state.phase === "prologue") {
    if (state.panelIndex < PROLOGUE_PANELS.length - 1) {
      state.panelIndex += 1;
      return state;
    }
    // Act1 open is empty on purpose — prologue already covered 背景/困难/目标.
    state.phase = OpenPhaseFor(CHAPTERS[state.chapterIndex]);
    state.panelIndex = 0;
    return state;
  }
  const chapter = CHAPTERS[state.chapterIndex];
  const list = state.phase === "panels" ? chapter.openPanels : chapter.closePanels;
  if (list.length && state.panelIndex < list.length - 1) {
    state.panelIndex += 1;
    return state;
  }
  if (state.phase === "panels") {
    state.phase = "play";
    return state;
  }
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "ending";
    return state;
  }
  const next = CreateCampaignState(state.chapterIndex + 1, { unlockedActs: state.unlockedActs });
  next.phase = OpenPhaseFor(CHAPTERS[next.chapterIndex]);
  next.panelIndex = 0;
  return next;
}

export function RestartChapter(state) {
  const next = CreateCampaignState(state.chapterIndex, { unlockedActs: state.unlockedActs });
  next.phase = OpenPhaseFor(CHAPTERS[next.chapterIndex]);
  return next;
}

export function SerializeProgress(state) {
  return { v: 6, chapterIndex: state.chapterIndex, unlockedActs: state.unlockedActs };
}

/** Test helper: put shovel in hand. */
export function DebugHold(state, itemId = ITEM_SHOVEL) {
  state.player.held = itemId;
  return state;
}

export function DebugPlanCell(state, c, r) {
  EnsurePlanGrid(state.level.soil);
  state.level.soil.plan[r][c] = true;
  return state;
}

export function LoadProgress(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    chapterIndex: Math.max(0, Math.min(CHAPTERS.length - 1, raw.chapterIndex | 0)),
    unlockedActs: Math.max(1, raw.unlockedActs | 0),
  };
}

export function SaveToStorage(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(SerializeProgress(state)));
    return true;
  } catch {
    return false;
  }
}

export function LoadFromStorage(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? LoadProgress(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function DebugCompleteGoal(state, goalId) {
  MarkGoal(state, goalId);
  return state;
}

export function GoalsRemaining(state) {
  return Object.entries(state.goalsDone)
    .filter(([, d]) => !d)
    .map(([id]) => id);
}

/** Always-on next-step copy for the play HUD — Act1 is hard-gated by tutorials. */
export function NextStepText(state) {
  const g = state.goalsDone;
  if (state.chapterId === "act1_connect") {
    if (!g.talk_laozhong) return "找高老忠交谈（E）";
    if (!g.talk_linxia) return "找林霞交谈（E）";
    if (state.player.held !== ITEM_SHOVEL) return "去井边捡铁锹（E）";
    if (!g.enter_hatch) return "带着铁锹到地窖口按 E 下洞";
    if (!g.link_ab) return "顺着蓝线走到格旁，点 J 挖通甲—乙";
    if (!g.link_bc) return "继续沿蓝线点 J，挖通乙—丙";
    return "三家已通";
  }
  if (state.chapterId === "act5_street_hunt") {
    if (!g.talk_street) return "听林霞交代（E）";
    if (!g.clear_street) {
      if ((state.player.ammo || 0) <= 0 && state.player.held !== ITEM_RIFLE) {
        return "捡枪/弹药，或绕到敌人背后 E 击晕";
      }
      if ((state.player.ammo || 0) <= 0) return "没子弹了：捡弹药，或背后 E 击晕";
      return "清街：开镜F开枪 / 扔手雷 / 背后E击晕（别让人看见尸体）";
    }
    return "街道已清";
  }
  const chapter = CHAPTERS[state.chapterIndex];
  const open = GoalsRemaining(state);
  if (!open.length) return "本幕目标已完成";
  return chapter?.objective || open[0];
}

/** Test helper: BFS-carve through SOFT (skips HARD) between two cells. */
export function DebugCarvePath(state, c0, r0, c1, r1) {
  const soil = state.level.soil;
  const key = (c, r) => `${c},${r}`;
  const prev = new Map();
  const q = [[c0, r0]];
  prev.set(key(c0, r0), null);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let found = false;
  while (q.length) {
    const [c, r] = q.shift();
    if (c === c1 && r === r1) {
      found = true;
      break;
    }
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      const k = key(nc, nr);
      if (prev.has(k)) continue;
      const cell = soil.cells[nr]?.[nc];
      if (cell === undefined || cell === 2) continue; // HARD
      prev.set(k, [c, r]);
      q.push([nc, nr]);
    }
  }
  if (found) {
    let cur = [c1, r1];
    while (cur) {
      CarveCell(soil, cur[0], cur[1]);
      const p = prev.get(key(cur[0], cur[1]));
      cur = p;
    }
  }
  RebuildTunnelSolids(state.level);
  SyncDigGoals(state);
  return found;
}
