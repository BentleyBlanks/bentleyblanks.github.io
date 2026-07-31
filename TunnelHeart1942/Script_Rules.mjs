import { CHAPTERS, SAVE_KEY } from "./Data_Story.mjs";
import {
  CarveCell,
  PickDigTarget,
  RebuildTunnelSolids,
  SetCell,
  AIR,
} from "./Script_Dig.mjs";
import { BuildLevel, EvalDigGoals, SURFACE_Y, VIEW_W } from "./Script_World.mjs";

export const PLAYER_W = 26;
export const PLAYER_H = 48;
export const GRAVITY = 1850;
export const MOVE_SPEED = 220;
export const JUMP_VEL = 680;
export const DIG_RATE = 0.85;

export function CreateInputState() {
  return {
    left: false,
    right: false,
    up: false,
    jump: false,
    jumpPressed: false,
    dig: false,
    interact: false,
    interactPressed: false,
    crouch: false,
  };
}

export function CreateCampaignState(chapterIndex = 0, progress = null) {
  const idx = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex | 0));
  const chapter = CHAPTERS[idx];
  const level = BuildLevel(chapter.id);
  const tunnel = !!level.spawn.tunnel;
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
      digging: false,
      digProgress: 0,
      digTarget: null,
      hp: 3,
      invuln: 0,
      inTunnel: tunnel,
    },
    cameraX: Math.max(0, level.spawn.x - VIEW_W * 0.35),
    cameraY: tunnel ? level.tunnelFloor - 300 : SURFACE_Y - 360,
    level,
    interactHint: "",
    /** Valiant Hearts-style bubble: { icons: string[], mutter?: string, timer } */
    bubble: null,
    subtitle: null,
    subtitleTimer: 0,
    winTimer: 0,
    failed: false,
    completed: false,
    pauseOpen: false,
    transition: 0,
    input: CreateInputState(),
    stats: { digs: 0, interactions: 0, shots: 0, cellsCarved: 0 },
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
  const speed = player.crouching ? MOVE_SPEED * 0.55 : MOVE_SPEED;
  player.vx = move * speed;
  if (move) player.facing = move;

  if (input.jumpPressed && player.onGround && !player.crouching && !input.dig) {
    player.vy = -JUMP_VEL;
    player.onGround = false;
  }

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
  if (goalId.includes("shot") || goalId.includes("patrol")) return "shot";
  if (goalId.includes("charge") || goalId.includes("signal")) return "charge";
  if (goalId.includes("talk")) return "talk";
  return "check";
}

function SetBubble(state, icons, mutter = "", time = 2.8) {
  state.bubble = { icons: icons || [], mutter, timer: time };
  state.subtitle = mutter ? { speaker: "", text: mutter } : null;
  state.subtitleTimer = time;
}

function SetSubtitle(state, speaker, text, time = 3.0) {
  // Keep API for existing call sites — route into VH bubble (no quest-log tone)
  const icons = GuessIcons(speaker, text);
  SetBubble(state, icons, text, time);
}

function GuessIcons(speaker, text) {
  const t = `${speaker}|${text}`;
  if (/挖|铁锨|软土|土洞|地窖/.test(t)) return ["shovel"];
  if (/钟/.test(t)) return ["bell"];
  if (/井|地道口|下到|回到地面/.test(t)) return ["hatch"];
  if (/翻口/.test(t)) return ["flip"];
  if (/特务|武工/.test(t)) return ["talk", "warn"];
  if (/打一枪|出击/.test(t)) return ["shot"];
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

function TryDig(state, dt) {
  const { player, level, input } = state;
  player.digging = false;
  player.digTarget = null;
  if (!input.dig || !player.inTunnel || !level.soil || state.transition > 0) {
    player.digProgress = 0;
    return;
  }

  const target = PickDigTarget(
    level.soil,
    player.x,
    player.y,
    player.facing,
    !!input.crouch,
    !!input.up || (!!input.jump && !player.onGround) || (!!input.jump && !!input.dig),
  );
  // Prefer explicit up while holding dig on ground
  const target2 =
    target ||
    (input.up || (input.jump && input.dig)
      ? PickDigTarget(level.soil, player.x, player.y, player.facing, false, true)
      : null);
  const dig = target2 || target;
  if (!dig) {
    player.digProgress = 0;
    state.interactHint = "";
    return;
  }

  player.digging = true;
  player.digTarget = dig;
  player.digProgress = Math.min(1, player.digProgress + DIG_RATE * dt);
  state.interactHint = "dig";
  if (player.digProgress < 1) return;

  if (CarveCell(level.soil, dig.c, dig.r)) {
    state.stats.digs += 1;
    state.stats.cellsCarved += 1;
    RebuildTunnelSolids(level);
    SyncDigGoals(state);
    SetBubble(state, ["shovel"], "", 0.6);
  }
  player.digProgress = 0;
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

  for (const ent of level.entities) {
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(player, ent)) continue;
    if (!Near(player, ent, ent.radius || 52)) continue;

    if (!GoalReady(state, ent) && ent.type !== "hatch" && ent.type !== "talk") {
      SetBubble(state, ["shovel", "warn"], "", 1.8);
      return;
    }

    if (ent.type === "talk") {
      ent.done = true;
      SetSubtitle(state, ent.speaker, ent.line, 3.6);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "hatch") {
      BeginHatchTransition(state, !player.inTunnel, ent);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "shelter") {
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "乡亲", ent.line, 2.2);
      return;
    }

    if (ent.type === "bell") {
      ent.done = true;
      ent.ringing = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(state, "高老忠", "快进洞——钟，我来敲！", 3.6);
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
      if (ent.used) return;
      ent.used = true;
      state.stats.shots += 1;
      if (ent.goal) MarkGoal(state, ent.goal);
      const patrol = level.entities.find((e) => e.type === "patrol" && !e.broken);
      if (patrol) {
        patrol.hits = (patrol.hits || 0) + 1;
        if (patrol.hits >= 3) {
          patrol.broken = true;
          MarkGoal(state, "break_patrol");
        }
      }
      SetSubtitle(state, "高传宝", "打一枪，换一个地方！", 1.8);
      if (ent.exitTo != null) player.x = ent.exitTo;
      return;
    }

    if (ent.type === "charge" || ent.type === "signal") {
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(
        state,
        ent.type === "charge" ? "高传宝" : "赵平原",
        ent.type === "charge" ? "药室安好。回地面发信号！" : "总攻——黑风口！",
        2.8,
      );
      return;
    }
  }
}

function UpdateActors(state, dt) {
  const { level, player } = state;
  for (const ent of level.entities) {
    if (ent.type === "spy" && ent.exposed && !ent.trapped) {
      const trap = level.entities.find((e) => e.type === "flip_trap");
      if (!trap) continue;
      ent.x += Math.sign(trap.x - ent.x) * 60 * dt;
    }
    if (ent.type === "patrol" && !ent.broken && ent.hostile) {
      ent.t = (ent.t || 0) + dt;
      ent.x = ent.homeX + Math.sin(ent.t * 0.65) * (ent.amp || 100);
      if (!player.inTunnel && player.invuln <= 0 && !player.crouching) {
        if (Math.abs(player.x - ent.x) < 38 && Math.abs(player.y - ent.y) < 40) {
          player.hp -= 1;
          player.invuln = 1.25;
          player.vy = -300;
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
    }
  }
  if (state.bubble) {
    state.bubble.timer -= dt;
    if (state.bubble.timer <= 0) state.bubble = null;
  }
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
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(state.player, ent)) continue;
    if (Near(state.player, ent, ent.radius || 52)) {
      state.interactHint = ent.type;
      return;
    }
  }
  if (state.player.inTunnel && state.level.soil) {
    const dig = PickDigTarget(
      state.level.soil,
      state.player.x,
      state.player.y,
      state.player.facing,
      !!state.input.crouch,
      !!state.input.up,
    );
    if (dig) state.interactHint = "dig";
  }
}

export function StepPlay(state, dt) {
  if (state.phase !== "play" || state.pauseOpen || state.failed || state.completed) return state;
  const clamped = Math.min(0.033, Math.max(0, dt));

  UpdateTransition(state, clamped);
  ResolvePhysics(state, clamped);
  TryDig(state, clamped);
  TryInteract(state);
  SyncDigGoals(state);
  RefreshHint(state);
  UpdateActors(state, clamped);
  UpdateCamera(state, clamped);

  if (AllGoalsDone(state) && !state.completed) {
    state.winTimer += clamped;
    if (state.winTimer > 0.9) {
      state.completed = true;
      state.phase = "closePanels";
      state.panelIndex = 0;
      state.unlockedActs = Math.max(state.unlockedActs, state.chapterIndex + 2);
    }
  } else state.winTimer = 0;

  state.input.jumpPressed = false;
  state.input.interactPressed = false;
  return state;
}

export function AdvancePanels(state) {
  const chapter = CHAPTERS[state.chapterIndex];
  const list = state.phase === "panels" ? chapter.openPanels : chapter.closePanels;
  if (state.panelIndex < list.length - 1) {
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
  next.phase = "panels";
  next.panelIndex = 0;
  return next;
}

export function RestartChapter(state) {
  const next = CreateCampaignState(state.chapterIndex, { unlockedActs: state.unlockedActs });
  next.phase = "panels";
  return next;
}

export function SerializeProgress(state) {
  return { v: 3, chapterIndex: state.chapterIndex, unlockedActs: state.unlockedActs };
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
