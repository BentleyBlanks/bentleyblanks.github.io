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
      /** Pocket grenades — stack; throw consumes one. */
      grenades:
        loadout.grenades ??
        (loadout.held === ITEM_GRENADE ? 1 : 0),
      shotCool: 0,
      throwCool: 0,
      /** Act7: locked to mg_nest, rapid fire, no ammo. */
      manningMg: false,
      meleeT: 0,
      meleeFacing: 1,
      throwT: 0,
      hp: 3,
      invuln: 0,
      inTunnel: tunnel,
    },
    meleeFx: null,
    blasts: [],
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
    /** In-play comic talk id — E/Space advances without re-standing on the NPC. */
    activeTalkId: null,
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

/** Floor strip under feet — never shove X against these. */
function IsFloorSolid(player, s) {
  return s.y >= player.y - 8 && s.y <= player.y + 10;
}

/** Ceiling / crawlway roof above the body — X-shove against merged ceiling teleports to map edge. */
function IsCeilingSolid(player, s) {
  return s.y + s.h <= player.y - 10;
}

/** True if standing (full height) would overlap a wall or ceiling solid. */
export function StandingWouldClip(player, solids) {
  const stand = { x: player.x - PLAYER_W / 2, y: player.y - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
  for (const s of solids || []) {
    if (!RectsOverlap(stand, s)) continue;
    if (IsFloorSolid(player, s)) continue;
    return true;
  }
  return false;
}

function ResolvePhysics(state, dt) {
  const { player, input, level } = state;
  if (state.transition > 0) return;

  if (player.meleeT > 0) {
    player.meleeT = Math.max(0, player.meleeT - dt);
    if (player.meleeFacing) player.facing = player.meleeFacing;
  }
  if (state.meleeFx) {
    state.meleeFx.timer -= dt;
    if (state.meleeFx.timer <= 0) state.meleeFx = null;
  }

  // Seized MG: pinned to the nest, always "ADS", spray with use/interact.
  if (player.manningMg) {
    const nest = level.entities.find((e) => e.type === "mg_nest");
    if (nest) {
      player.x = nest.x;
      player.facing = nest.facing || 1;
    }
    player.y = SURFACE_Y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.inTunnel = false;
    player.crouching = false;
    player.aiming = true;
    if (player.shotCool > 0) player.shotCool = Math.max(0, player.shotCool - dt);
    return;
  }

  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const solids = SolidsFor(state);
  // Dig must NOT force-stand — that clips the head into a 1-high crawlway roof.
  let crouch = !!input.crouch && player.onGround;
  if (!crouch && player.inTunnel && player.onGround && StandingWouldClip(player, solids)) {
    crouch = true; // low ceiling — stay crouched until there's headroom
  }
  player.crouching = crouch;
  player.aiming = !!input.aim && CanShoot(player.held) && !state.designMode && !player.inTunnel;
  let speed = MOVE_SPEED;
  if (player.crouching) speed *= 0.55;
  if (player.aiming) speed *= 0.32;
  // Melee lunge: plant feet mid-strike so the chop reads.
  if (player.meleeT > 0.08) {
    player.vx = (player.meleeFacing || player.facing || 1) * 40;
  } else {
    player.vx = move * speed;
    if (move && !player.aiming) player.facing = move;
  }
  if (player.shotCool > 0) player.shotCool = Math.max(0, player.shotCool - dt);
  if (player.throwCool > 0) player.throwCool = Math.max(0, player.throwCool - dt);
  if (player.throwT > 0) player.throwT = Math.max(0, player.throwT - dt);
  // No Mario jump — Valiant Hearts traversal is walk / crawl / dig / hatch.

  player.vy += GRAVITY * dt;

  player.x += player.vx * dt;
  player.x = Math.max(20, Math.min(level.width - 20, player.x));
  let aabb = PlayerAabb(player);
  for (const s of solids) {
    if (!RectsOverlap(aabb, s)) continue;
    // Only real walls shove on X — floor/ceiling strips are Y-resolved.
    if (IsFloorSolid(player, s) || IsCeilingSolid(player, s)) continue;
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
  for (const s of solids) {
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

function ResolveSpeakerAnchor(state, speaker, fallbackEnt = null) {
  const name = speaker || "";
  if (/高传宝|^传宝$/.test(name)) {
    return { id: "player", x: state.player.x, y: state.player.y };
  }
  const match = (state.level.entities || []).find(
    (e) =>
      !e.hidden &&
      (e.type === "talk" || e.type === "spy_talk" || e.type === "shelter") &&
      e.speaker === name,
  );
  if (match) return { id: match.id, x: match.x, y: match.y };
  if (fallbackEnt) return { id: fallbackEnt.id, x: fallbackEnt.x, y: fallbackEnt.y };
  return { id: "player", x: state.player.x, y: state.player.y };
}

function ClearDialogue(state) {
  state.subtitle = null;
  state.subtitleTimer = 0;
  state.bubble = null;
}

function SetBubble(state, icons, mutter = "", time = 2.8) {
  state.bubble = { icons: icons || [], mutter, timer: time };
  if (mutter) {
    const prev = state.subtitle;
    const speaker =
      prev && prev.text === mutter && prev.speaker ? prev.speaker : prev?.speaker || "";
    const anchor = ResolveSpeakerAnchor(state, speaker || "高传宝");
    state.subtitle = {
      speaker,
      text: mutter,
      comic: true,
      anchorId: anchor.id,
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
    state.subtitleTimer = time;
  }
}

function SetSubtitle(state, speaker, text, time = 4.8, opts = {}) {
  const icons = GuessIcons(speaker, text);
  const fallback = opts.fallbackEnt || null;
  const anchor =
    opts.anchorX != null
      ? { id: opts.anchorId || null, x: opts.anchorX, y: opts.anchorY ?? 0 }
      : ResolveSpeakerAnchor(state, speaker, fallback);
  // System tips must NOT be comic — comic locks the mobile big key to "talk".
  const tipSpeaker = speaker === "提示" || speaker === "设计";
  const comic = opts.comic !== undefined ? !!opts.comic : !tipSpeaker;
  state.subtitle = {
    speaker: speaker || "",
    text,
    comic,
    anchorId: anchor.id,
    anchorX: anchor.x,
    anchorY: anchor.y,
  };
  state.subtitleTimer = time;
  state.bubble = {
    icons,
    mutter: text,
    timer: time,
    anchorId: anchor.id,
    anchorX: anchor.x,
    anchorY: anchor.y,
  };
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
  SetSubtitle(state, next.speaker || "", next.text || "", next.time ?? 3.2, {
    comic: true,
  });
}

function AdvanceTalk(state, ent) {
  const script = ent.script || (ent.line ? [{ speaker: ent.speaker || "？", text: ent.line }] : []);
  if (!script.length) {
    ent.done = true;
    state.activeTalkId = null;
    ClearDialogue(state);
    return;
  }
  const idx = ent.scriptIndex | 0;
  const beat = script[idx];
  const speaker = beat.speaker || ent.speaker || "";
  SetSubtitle(state, speaker, beat.text, 12, { fallbackEnt: ent, comic: true });
  ent.scriptIndex = idx + 1;
  if (ent.scriptIndex >= script.length) {
    ent.done = true;
    if (ent.goal) MarkGoal(state, ent.goal);
    // Conversation finished — clear active lock so the next NPC can be talked to;
    // last bubble stays until E/Space dismiss or timer.
    state.activeTalkId = null;
  } else {
    state.activeTalkId = ent.id;
  }
}

/** E/Space/互动：推进进行中的漫画对话（开聊后不要求贴着 NPC）。 */
function TryAdvanceActiveTalk(state) {
  if (!state.activeTalkId) return false;
  const ent = (state.level.entities || []).find((e) => e.id === state.activeTalkId);
  if (!ent || ent.done) {
    state.activeTalkId = null;
    return false;
  }
  AdvanceTalk(state, ent);
  return true;
}

function TryDismissSubtitle(state) {
  if (state.subtitle && state.subtitleTimer > 0) {
    ClearDialogue(state);
    DrainSubtitleQueue(state);
    return true;
  }
  if (state.subtitleQueue && state.subtitleQueue.length) {
    DrainSubtitleQueue(state);
    return true;
  }
  return false;
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
  // Leaving the tunnel always drops design — it must never trap surface play.
  if (!player.inTunnel && state.designMode) state.designMode = false;
  if (!player.inTunnel || !level.soil || state.transition > 0) {
    if (input.designTogglePressed && player.inTunnel === false) {
      SetSubtitle(state, "提示", "下到地窖里，贴土壁用铁锹挖就能联通。", 2.4);
    }
    return;
  }
  if (input.designTogglePressed) {
    state.designMode = !state.designMode;
    if (state.designMode) {
      EnsurePlanGrid(level.soil);
      state.planCursor = InitPlanCursor(level.soil, player.x, player.y, player.facing);
      SetSubtitle(
        state,
        "提示",
        "这是可选画线。联通地窖不靠它——点铁锹大键会退出并直接挖土。",
        4.0,
      );
    } else {
      SetSubtitle(state, "提示", "已退出画线。贴着土壁点铁锹挖，挖通甲乙丙三家。", 2.8);
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
  // digPressed is ALWAYS excavate — never steal it for marking (that trapped mobile).
  if (input.planPaintPressed) {
    const res = TogglePlanCell(level.soil, cur.c, cur.r);
    if (res === "mark") SetBubble(state, ["shovel"], "标记", 0.8);
    else if (res === "erase") SetBubble(state, ["warn"], "取消", 0.8);
    else SetBubble(state, ["shovel", "warn"], "须从空洞延伸", 1.4);
  }
  if (input.planErasePressed) {
    if (ClearPlanCell(level.soil, cur.c, cur.r)) SetBubble(state, ["warn"], "擦除", 0.6);
  }
  if (input.planChamberPressed) {
    const n = StampChamberPlan(level.soil, cur.c, cur.r, 2, 2);
    SetSubtitle(state, "提示", n ? `厢室标记 +${n}` : "此处无法铺厢室", 2.0);
  }
  if (input.planCorridorPressed) {
    const face = player.facing >= 0 ? 1 : -1;
    const n = StampCorridorPlan(level.soil, cur.c, cur.r, face, 5);
    SetSubtitle(state, "提示", n ? `巷道标记 +${n}` : "巷道延伸失败", 2.0);
  }
}

function TryExcavate(state) {
  const { player, level, input } = state;
  player.digging = false;
  player.digTarget = null;
  // Design mode used to block dig entirely — that stranded mobile players.
  // Any dig tap exits design and carves.
  if (state.designMode && input.digPressed) {
    state.designMode = false;
    SetBubble(state, ["shovel"], "退出画线·开挖", 0.9);
  }
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
      SetSubtitle(state, "提示", "走到蓝色格子旁边，或贴着土壁再挖。", 2.6);
      state.interactHint = "follow_plan";
    } else {
      SetSubtitle(state, "提示", "贴着空洞边的软土再挖。站太远挖不着。", 2.6);
      state.interactHint = "need_plan";
    }
    return;
  }
  player.digTarget = dig;
  state.interactHint = "dig";
  if (CarveCell(level.soil, dig.c, dig.r)) {
    state.stats.digs += 1;
    state.stats.cellsCarved += 1;
    // Always clear soft headroom above the dig — 1-high crawlways trap a standing digger.
    const headR = dig.r - 1;
    if (GetCell(level.soil, dig.c, headR) === SOFT) {
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
    // Grenades stack in a pocket (like ammo) and show in hand when empty-handed.
    if (ent.itemId === ITEM_GRENADE) {
      const add = ent.grenadeAmount || 1;
      player.grenades = (player.grenades || 0) + add;
      if (!player.held || player.held === ITEM_GRENADE) player.held = ITEM_GRENADE;
      ent.taken = true;
      ent.hidden = true;
      state.stats.pickups += 1;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetBubble(state, ["warn"], `+${add}雷`, 1.2);
      SetSubtitle(state, "提示", `手雷 ×${player.grenades}。朝面朝方向扔；抬头高抛，蹲下近抛。`, 2.4);
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

/** Act7 mounted MG — belt-fed, long range, keeps the nest pinned down. */
function FireMg(state) {
  const { player } = state;
  if ((player.shotCool || 0) > 0) return;
  if (!player.manningMg) return;
  player.shotCool = 0.11;
  state.stats.shots += 1;
  state.stats.mgShots = (state.stats.mgShots || 0) + 1;
  const facing = player.facing || 1;
  const range = 560;
  state.muzzle = {
    x: player.x + facing * 34,
    y: SURFACE_Y - 32,
    timer: 0.1,
    facing,
  };
  const living = state.level.entities.filter((e) => e.type === "enemy" && !e.dead && !e.inTunnel);
  let best = null;
  let bestD = range;
  for (const e of living) {
    if (e.id === "mg_gunner") continue; // already silenced
    const dx = e.x - player.x;
    if (facing > 0 && dx < 12) continue;
    if (facing < 0 && dx > -12) continue;
    const d = Math.abs(dx);
    if (d < bestD && Math.abs((e.y || 0) - SURFACE_Y) < 64) {
      bestD = d;
      best = e;
    }
  }
  AlertEnemiesNear(state, player.x, 420, 4.0);
  if (!best) return;
  HurtEnemy(state, best, 2);
}

function FireRifle(state) {
  const { player } = state;
  if (player.manningMg) {
    FireMg(state);
    return;
  }
  if ((player.shotCool || 0) > 0) return;
  if (!CanShoot(player.held)) return;
  if ((player.ammo || 0) <= 0) {
    state.interactHint = "need_ammo";
    SetBubble(state, ["shot", "warn"], "没子弹", 1.4);
    SetSubtitle(state, "提示", "弹药空了——去捡子弹，或摸到背后悄悄制住。", 2.6);
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

  if (player.manningMg) {
    FireMg(state);
    return;
  }

  if (CanShoot(player.held)) {
    FireRifle(state);
    return;
  }

  if (CanThrowGrenade(player)) {
    ThrowGrenade(state);
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

function HurtEnemy(state, ent, dmg, opts = {}) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  // Sandbag cover cuts bullet damage; blast ignores cover.
  let dealt = dmg;
  if (ent.cover && !opts.blast) dealt = Math.max(1, Math.floor(dmg * 0.5));
  ent.hp -= dealt;
  ent.hurtFlash = opts.blast ? 0.4 : 0.28;
  if (ent.hp <= 0) {
    ent.hp = 0;
    ent.dead = true;
    ent.corpse = true;
    state.stats.kills = (state.stats.kills || 0) + 1;
    if (opts.blast) state.stats.grenadeKills = (state.stats.grenadeKills || 0) + 1;
    DropEnemyLoot(state, ent);
    SyncKillGoals(state);
    return true;
  }
  return false;
}

export function GrenadeCount(player) {
  return Math.max(0, player.grenades | 0);
}

export function CanThrowGrenade(player) {
  if (!player || player.inTunnel || player.manningMg) return false;
  return GrenadeCount(player) > 0 || player.held === ITEM_GRENADE;
}

function ConsumeGrenade(player) {
  if ((player.grenades || 0) > 0) {
    player.grenades -= 1;
    if (player.grenades <= 0 && player.held === ITEM_GRENADE) player.held = ITEM_NONE;
    return true;
  }
  if (player.held === ITEM_GRENADE) {
    player.held = ITEM_NONE;
    return true;
  }
  return false;
}

/** Lob a stick grenade — up = high arc, crouch = short toss. */
function ThrowGrenade(state) {
  const { player, input } = state;
  if ((player.throwCool || 0) > 0) return false;
  if (!CanThrowGrenade(player)) return false;
  if (!ConsumeGrenade(player)) return false;

  // Ranges tuned so lobs land ~80–170px ahead (inside blast), not across the map.
  let speed = 300;
  let loft = -280;
  if (input.up) {
    speed = 240;
    loft = -360; // high lob over sandbags
  } else if (input.crouch) {
    speed = 190;
    loft = -120; // short dump into a doorway
  }
  const facing = player.facing || 1;
  state.projectiles.push({
    kind: "grenade",
    x: player.x + facing * 22,
    y: (player.y || SURFACE_Y) - (player.crouching ? 22 : 32),
    vx: facing * speed,
    vy: loft,
    life: 1.35,
    bounced: false,
  });
  player.throwCool = 0.55;
  player.throwT = 0.36;
  player.facing = facing;
  state.stats.grenadesThrown = (state.stats.grenadesThrown || 0) + 1;
  SetBubble(state, ["warn"], "手雷", 0.7);
  AlertEnemiesNear(state, player.x, 160, 2.2);
  return true;
}

function DetonateGrenade(state, p) {
  const blastR = 92;
  state.blasts = state.blasts || [];
  state.blasts.push({ x: p.x, y: p.y, timer: 0.5, r: blastR });
  AlertEnemiesNear(state, p.x, 340, 5.5);
  let hits = 0;
  for (const ent of state.level.entities) {
    if (ent.type === "sandbag" && !ent.broken) {
      if (Math.hypot(ent.x - p.x, (ent.y || 0) - p.y) < blastR) {
        ent.broken = true;
        ent.hidden = true;
        state.stats.coversBroken = (state.stats.coversBroken || 0) + 1;
      }
      continue;
    }
    if (ent.type === "enemy" && !ent.dead) {
      if (Math.hypot(ent.x - p.x, (ent.y || 0) - p.y) < blastR) {
        const killed = HurtEnemy(state, ent, 3, { blast: true });
        hits += 1;
        if (killed) SetSubtitle(state, "高传宝", "手榴弹——一窝端！", 1.8);
      }
      continue;
    }
    if (ent.type === "patrol" && !ent.broken) {
      if (Math.hypot(ent.x - p.x, (ent.y || 0) - p.y) < 70) {
        ent.hits = (ent.hits || 0) + 3;
        if (ent.hits >= 3) {
          ent.broken = true;
          MarkGoal(state, "break_patrol");
        }
      }
    }
  }
  // Cover melts with the bags — leftover foes can be finished with rifle/melee.
  for (const foe of state.level.entities) {
    if (foe.type !== "enemy" || foe.dead || !foe.cover) continue;
    const shield = state.level.entities.some(
      (b) => b.type === "sandbag" && !b.broken && Math.abs(b.x - foe.x) < 90,
    );
    if (!shield) foe.cover = false;
  }
  if (hits > 0 && hits < 2) SetSubtitle(state, "高传宝", "炸中了！再补一颗！", 1.6);
  else if (hits === 0) SetSubtitle(state, "高传宝", "炸偏了——贴着沙袋再丢。", 1.5);
}

/** Silent / melee KO finish. */
function KnockOutEnemy(state, ent) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  ent.hp = 0;
  ent.dead = true;
  ent.ko = true;
  ent.corpse = true;
  ent.hurtFlash = 0.35;
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

/** puppet = 伪军 (easy); ijp = 鬼子/机枪手 (hard, counters front). */
export function EnemyFaction(ent) {
  if (!ent) return "ijp";
  if (ent.faction === "puppet" || ent.faction === "ijp") return ent.faction;
  if (ent.label === "伪军") return "puppet";
  return "ijp";
}

function IsBehindEnemy(player, ent) {
  const dx = player.x - ent.x;
  const face = EnemyFacing(ent);
  return face > 0 ? dx < -8 : dx > 8;
}

/** Close enough to throw a fist — any angle. */
export function CanMeleeReach(player, ent) {
  if (!ent || ent.type !== "enemy" || ent.dead) return false;
  if (!LayerOk(player, ent)) return false;
  if (player.inTunnel || player.manningMg) return false;
  if ((player.meleeT || 0) > 0.12) return false;
  if (Math.abs(player.x - ent.x) > 52) return false;
  if (Math.abs((player.y || 0) - (ent.y || 0)) > 48) return false;
  return true;
}

/** @deprecated name kept for smoke/string refs — now means melee reach. */
function CanStealthKO(player, ent) {
  return CanMeleeReach(player, ent);
}

function BeginMeleeStrike(state, dir) {
  const player = state.player;
  player.meleeT = 0.42;
  player.meleeFacing = dir || player.facing || 1;
  player.facing = player.meleeFacing;
  player._animT = 0;
  player._animClip = "melee";
}

function MeleeCounter(state, ent) {
  const player = state.player;
  const dir = Math.sign(ent.x - player.x) || player.facing || 1;
  player.hp -= 1;
  player.invuln = 1.15;
  player.vx = -dir * 180;
  ent.alert = Math.max(ent.alert || 0, 5.5);
  ent.alertX = player.x;
  ent.highAlert = true;
  ent.hurtFlash = 0.15;
  AlertEnemiesNear(state, player.x, 220, 4.5);
  state.meleeFx = { x: (player.x + ent.x) / 2, y: SURFACE_Y - 36, timer: 0.28, ok: false };
  SetBubble(state, ["warn"], "反抓", 1.0);
  SetSubtitle(
    state,
    ent.label === "伪军" ? "伪军" : "鬼子",
    EnemyFaction(ent) === "ijp"
      ? "日军有防备——被反手抓住了！别正面硬抢！"
      : "被挡住了！",
    2.4,
  );
  if (player.hp <= 0) state.failed = true;
  return false;
}

/**
 * Proximity KO: 伪军 — close = down. 鬼子 — only clean rear (crouch if alerted);
 * front / side = counter grab.
 */
function TryMeleeKO(state, ent) {
  const player = state.player;
  if (!CanMeleeReach(player, ent)) return false;
  const dir = Math.sign(ent.x - player.x) || player.facing || 1;
  BeginMeleeStrike(state, dir);
  state.meleeFx = { x: (player.x + ent.x) / 2, y: SURFACE_Y - 34, timer: 0.22, ok: true };

  const faction = EnemyFaction(ent);
  const behind = IsBehindEnemy(player, ent);

  if (faction === "puppet") {
    KnockOutEnemy(state, ent);
    SetBubble(state, ["warn"], "击晕", 0.9);
    SetSubtitle(state, "高传宝", "伪军好对付——靠近就给他一下。", 2.0);
    return true;
  }

  // IJA / gunner: rear only; high alert needs crouch from behind.
  const alerted = !!ent.highAlert || (ent.alert || 0) > 1.2;
  if (behind && (!alerted || player.crouching)) {
    KnockOutEnemy(state, ent);
    SetBubble(state, ["warn"], "击晕", 0.9);
    SetSubtitle(
      state,
      "高传宝",
      ent.id === "mg_gunner" ? "机枪手制住了——枪是咱们的！" : "鬼子得摸背后——正面会反抓你。",
      2.4,
    );
    return true;
  }
  state.meleeFx.ok = false;
  return MeleeCounter(state, ent);
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
    MarkGoal(state, "clear_grenade_yard");
  }
  SyncMgNestGoals(state);
}

function SyncMgNestGoals(state) {
  if (state.chapterId !== "act7_mg_nest") return;
  const gunner = state.level.entities.find((e) => e.id === "mg_gunner");
  if (gunner?.dead) MarkGoal(state, "silence_gunner");
  if (!state.goalsDone.man_mg) return;
  const waves = state.level.mgWaves || [];
  if ((state.level.mgWaveIndex || 0) < waves.length) return;
  const waveFoes = state.level.entities.filter((e) => e.waveSpawn);
  if (waveFoes.length && waveFoes.every((e) => e.dead)) MarkGoal(state, "hold_waves");
}

function SpawnMgWaveEnemy(state, spec, waveIdx) {
  const hp = spec.hp ?? 2;
  state.level.entities.push({
    id: `wave_${waveIdx}_${Math.round(spec.x)}`,
    type: "enemy",
    x: spec.x,
    y: SURFACE_Y,
    layer: "surface",
    homeX: spec.x,
    amp: spec.amp ?? 40,
    phase: spec.phase ?? 0,
    hp,
    maxHp: hp,
    dead: false,
    ko: false,
    corpse: false,
    discovered: false,
    highAlert: true,
    facing: -1,
    alert: 5,
    alertX: state.player.x,
    hurtFlash: 0,
    label: spec.label || "鬼子",
    faction: spec.label === "伪军" ? "puppet" : "ijp",
    hostile: true,
    t: 0,
    waveSpawn: true,
    dropAmmo: 0,
    dropRifle: false,
    dropGrenade: false,
  });
}

function UpdateMgWaves(state, dt) {
  const level = state.level;
  if (state.chapterId !== "act7_mg_nest" || !level.mgArmed) return;
  const waves = level.mgWaves || [];
  const living = level.entities.filter((e) => e.waveSpawn && !e.dead);
  for (const e of living) {
    e.alert = Math.max(e.alert || 0, 2.5);
    e.alertX = state.player.x;
    e.highAlert = true;
  }
  if (living.length) return;
  if ((level.mgWaveIndex || 0) >= waves.length) {
    SyncMgNestGoals(state);
    return;
  }
  level.mgWaveTimer = (level.mgWaveTimer || 0) - dt;
  if (level.mgWaveTimer > 0) return;
  const wave = waves[level.mgWaveIndex];
  const idx = level.mgWaveIndex;
  level.mgWaveIndex += 1;
  level.mgWaveTimer = wave.gap ?? 1.2;
  for (const f of wave.foes || []) SpawnMgWaveEnemy(state, f, idx);
  SetSubtitle(state, "高传宝", wave.bark || "开火！", 1.8);
  SetBubble(state, ["shot"], "机枪", 0.8);
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
    p.vy += GRAVITY * 0.62 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Soft bounce on the walk plane so lobs settle into cover before boom.
    if (p.kind === "grenade" && p.y >= SURFACE_Y - 2 && p.vy > 0) {
      p.y = SURFACE_Y - 2;
      if (!p.bounced) {
        p.bounced = true;
        p.vy *= -0.28;
        p.vx *= 0.45;
      } else {
        p.vy = 0;
        p.vx *= 0.7;
      }
    }
    p.life -= dt;
    // Fuse out, or cook off once the stick has settled on the dirt.
    const settled =
      p.kind === "grenade" && p.bounced && Math.abs(p.vy) < 8 && Math.abs(p.vx) < 40 && p.life < 1.0;
    if (p.life <= 0 || settled) {
      if (p.kind === "grenade") DetonateGrenade(state, p);
      continue;
    }
    next.push(p);
  }
  state.projectiles = next;
  if (state.muzzle) {
    state.muzzle.timer -= dt;
    if (state.muzzle.timer <= 0) state.muzzle = null;
  }
  if (state.blasts) {
    state.blasts = state.blasts.filter((b) => {
      b.timer -= dt;
      return b.timer > 0;
    });
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

  // Comic talk: once started, E/Space/互动 always advances or confirms — no re-proximity.
  if (TryAdvanceActiveTalk(state)) {
    state.stats.interactions += 1;
    return;
  }

  state.stats.interactions += 1;

  // Melee KO before world props — nest/hatch must not eat a lined-up takedown.
  let bestFoe = null;
  let bestD = 9999;
  for (const ent of level.entities) {
    if (ent.type !== "enemy" || ent.dead) continue;
    if (!CanMeleeReach(player, ent)) continue;
    const d = Math.abs(player.x - ent.x);
    if (d < bestD) {
      bestD = d;
      bestFoe = ent;
    }
  }
  if (bestFoe) {
    TryMeleeKO(state, bestFoe);
    return;
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

    if (ent.type === "mg_nest") {
      if (player.inTunnel) {
        SetSubtitle(state, "提示", "先出井，再抢机枪。", 2.0);
        return;
      }
      const gunner = level.entities.find((e) => e.id === "mg_gunner");
      if (gunner && !gunner.dead) {
        SetSubtitle(state, "提示", "先制住机枪手——绕到他背后。", 2.4);
        return;
      }
      if (player.manningMg) return;
      MarkGoal(state, "silence_gunner");
      player.manningMg = true;
      player.inTunnel = false;
      player.x = ent.x;
      player.facing = ent.facing || 1;
      if (ent.goal) MarkGoal(state, ent.goal);
      level.mgArmed = true;
      level.mgWaveIndex = 0;
      level.mgWaveTimer = 0.55;
      SetSubtitle(state, "高传宝", "机枪到手！来多少日伪军，扫多少！", 3.0);
      SetBubble(state, ["shot"], "机枪", 1.2);
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
      if (ent.requiresGoal && !GoalReady(state, ent)) {
        SetBubble(state, ["shovel", "warn"], "地道还没挖通", 1.6);
        SetSubtitle(state, "提示", "先挖通到营盘底下，再翻这口井。", 2.6);
        return;
      }
      // Don't dive back down while standing on the nest after silencing the gunner.
      if (
        !player.inTunnel &&
        state.goalsDone.silence_gunner &&
        !state.goalsDone.man_mg &&
        level.entities.some((e) => e.type === "mg_nest" && Near(player, e, e.radius || 64))
      ) {
        continue;
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
      SetBubble(state, ["charge"], "在此安放炸药", 1.4);
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
  const picks = state.stats.pickups;
  TryPickupOrInteract(state);
  // Nothing grabbed — E/Space still closes a lingering comic / film line
  if (state.stats.pickups === picks) TryDismissSubtitle(state);
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
      if (state.activeTalkId) {
        const talk = level.entities.find((e) => e.id === state.activeTalkId);
        if (!talk || talk.done) state.activeTalkId = null;
      }
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
  const digReady =
    state.player.inTunnel &&
    state.level.soil &&
    CanDigWith(state.player.held) &&
    !state.designMode &&
    PickExcavateTarget(
      state.level.soil,
      state.player.x,
      state.player.y,
      state.player.facing,
      !!state.input.crouch,
      !!state.input.up,
    );
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
    if (ent.type === "enemy" && !ent.dead && CanMeleeReach(state.player, ent)) {
      const behind = IsBehindEnemy(state.player, ent);
      const hard = EnemyFaction(ent) === "ijp";
      state.interactHint = hard && !behind ? "melee_risky" : "stealth_ko";
      return;
    }
  }
  for (const ent of state.level.entities) {
    if (ent.kind === "pickup") continue;
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(state.player, ent)) continue;
    if (Near(state.player, ent, ent.radius || 52)) {
      // Underground with a diggable wall: dig beats hatch so the big key isn't stolen.
      if (ent.type === "hatch" && digReady) continue;
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
  if (digReady) state.interactHint = "dig";
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
  TryInteract(state);
  // Excavate before physics — solids can shove the digger off the planned cell for a frame.
  // Dig always wins over design mode (auto-exits).
  TryExcavate(state);
  ResolvePhysics(state, clamped);
  SyncDigGoals(state);
  SyncMgNestGoals(state);
  RefreshHint(state);
  UpdateActors(state, clamped);
  UpdateMgWaves(state, clamped);
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
  return { v: 7, chapterIndex: state.chapterIndex, unlockedActs: state.unlockedActs };
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
  const p = state.player;
  // Underground controls must read on the HUD — pad merge made this easy to miss.
  // Act7 has its own step ladder (includes surface MG phase) — skip generic tunnel tip.
  if (p.inTunnel && state.chapterId !== "act7_mg_nest") {
    if (state.designMode) {
      return "误进画线了：直接点铁锹大键——退出并挖土";
    }
    if (state.chapterId === "act1_connect") {
      if (!g.link_ab) return "联通甲—乙：贴着土壁/蓝格，反复点铁锹大键往前挖";
      if (!g.link_bc) return "联通乙—丙：继续贴壁点铁锹挖";
      return "三家已通 · 回井口上地面";
    }
    if (CanDigWith(p.held)) {
      return "贴着土壁，反复点铁锹大键挖通";
    }
    return "地道里需要铁锹才能挖；靠近井口可上地面";
  }
  if (state.chapterId === "act1_connect") {
    if (!g.talk_laozhong) return "找高老忠交谈";
    if (!g.talk_linxia) return "找林霞交谈";
    if (p.held !== ITEM_SHOVEL) return "去井边捡铁锹";
    if (!g.enter_hatch) return "带着铁锹到地窖口下洞";
    if (!g.link_ab) return "下洞后走到蓝格旁，点铁锹开挖";
    if (!g.link_bc) return "继续沿蓝线挖通乙—丙";
    return "三家已通";
  }
  if (state.chapterId === "act5_street_hunt") {
    if (!g.talk_street) return "听林霞交代";
    if (!g.clear_street) {
      if ((state.player.ammo || 0) <= 0 && state.player.held !== ITEM_RIFLE) {
        return "捡枪/弹药，或绕到敌人背后击晕";
      }
      if ((state.player.ammo || 0) <= 0) return "没子弹了：捡弹药，或靠近敲晕";
      return "清街：伪军靠近就敲；鬼子摸背后——正面会反抓。别让人看见尸体";
    }
    return "街道已清";
  }
  if (state.chapterId === "act7_mg_nest") {
    if (p.manningMg || g.man_mg) {
      if (!g.hold_waves) return "按住开火扫射！打光扑上来的日伪军";
      return "机枪巢守住了";
    }
    if (!g.talk_mg) return "听林霞交代敌营机枪巢";
    if (!g.link_camp) {
      if (p.inTunnel) return "绕硬土、爬低洞，挖通到敌营底下";
      return "下洞：绕硬土爬低洞，挖到敌营下";
    }
    if (!g.surface_camp) return "从敌营翻口出井（在机枪手背后）";
    if (!g.silence_gunner) return "绕到机枪手背后制住他";
    if (!g.man_mg) return "点机枪巢，抢过机枪";
    return "扫光来犯日伪军";
  }
  if (state.chapterId === "act8_grenade_yard") {
    if (!g.talk_nade) return "听林霞交代沙袋场";
    if (!g.stock_nades) return "去雷箱捡手雷（口袋可叠）";
    if (!g.clear_grenade_yard) {
      if (GrenadeCount(p) <= 0) return "雷用完了——再去雷箱补，或捡地上掉的";
      return "抬头高抛过沙袋，蹲下近抛；炸开沙袋后的日伪军";
    }
    return "沙袋场已清";
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
