import { CHAPTERS, SAVE_KEY } from "./Data_Story.mjs";
import { BuildLevel, SURFACE_Y, TUNNEL_FLOOR, VIEW_W } from "./Script_World.mjs";

export const PLAYER_W = 26;
export const PLAYER_H = 48;
export const GRAVITY = 1850;
export const MOVE_SPEED = 230;
export const JUMP_VEL = 700; // apex ≈ 132px — clears 36px rubble, not dig seals
export const DIG_RATE = 0.7;

export function CreateInputState() {
  return {
    left: false,
    right: false,
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
    phase: "title", // title | panels | play | closePanels | ending
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
      hp: 3,
      invuln: 0,
      inTunnel: tunnel,
    },
    cameraX: Math.max(0, level.spawn.x - VIEW_W * 0.35),
    cameraY: tunnel ? TUNNEL_FLOOR - 320 : SURFACE_Y - 360,
    level,
    interactHint: "",
    subtitle: null,
    subtitleTimer: 0,
    winTimer: 0,
    failed: false,
    completed: false,
    pauseOpen: false,
    transition: 0, // hatch blackout 0..1..0
    input: CreateInputState(),
    stats: { digs: 0, interactions: 0, shots: 0 },
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

  if (input.jumpPressed && player.onGround && !player.crouching) {
    player.vy = -JUMP_VEL;
    player.onGround = false;
  }

  player.vy += GRAVITY * dt;

  // --- X axis ---
  player.x += player.vx * dt;
  player.x = Math.max(20, Math.min(level.width - 20, player.x));
  let aabb = PlayerAabb(player);
  for (const s of SolidsFor(state)) {
    if (!RectsOverlap(aabb, s)) continue;
    if (player.vx > 0) player.x = s.x - PLAYER_W / 2;
    else if (player.vx < 0) player.x = s.x + s.w + PLAYER_W / 2;
    else {
      // pushed into seal — exit toward nearer side
      const mid = s.x + s.w / 2;
      player.x = player.x < mid ? s.x - PLAYER_W / 2 : s.x + s.w + PLAYER_W / 2;
    }
    aabb = PlayerAabb(player);
  }

  // --- Y axis ---
  const prevY = player.y;
  player.y += player.vy * dt;
  aabb = PlayerAabb(player);
  player.onGround = false;
  for (const s of SolidsFor(state)) {
    if (!RectsOverlap(aabb, s)) continue;
    const prevBottom = prevY;
    const prevTop = prevY - aabb.h;
    if (player.vy >= 0 && prevBottom <= s.y + 6) {
      player.y = s.y;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && prevTop >= s.y + s.h - 6) {
      player.y = s.y + s.h + aabb.h;
      player.vy = 0;
    } else if (!s.digOnly) {
      // sideways trap — nudge out
      const mid = s.x + s.w / 2;
      player.x = player.x < mid ? s.x - PLAYER_W / 2 : s.x + s.w + PLAYER_W / 2;
    }
    aabb = PlayerAabb(player);
  }

  const floor = player.inTunnel ? level.tunnelFloor : level.surfaceY;
  if (player.y > floor) {
    player.y = floor;
    player.vy = 0;
    player.onGround = true;
  }
  if (player.inTunnel) {
    const minY = level.tunnelCeil + aabb.h + 2;
    // feet y minimum when head would hit ceiling mid-jump
    if (player.y - aabb.h < level.tunnelCeil) {
      player.y = minY;
      if (player.vy < 0) player.vy = 0;
    }
  }

  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
}

function Near(player, ent, radius = 48) {
  const ex = ent.x + (ent.w || 28) / 2;
  const r = ent.radius || radius;
  // Hatches / shafts span surface↔tunnel — only X matters.
  if (ent.type === "hatch" || ent.layer === "both") {
    return Math.abs(player.x - ex) < r;
  }
  const ey = ent.y;
  return Math.hypot(player.x - ex, player.y - ey) < r;
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
}

function SetSubtitle(state, speaker, text, time = 3.0) {
  state.subtitle = { speaker, text };
  state.subtitleTimer = time;
}

function TryDig(state, dt) {
  const { player, level, input } = state;
  player.digging = false;
  if (!input.dig || !player.onGround || state.transition > 0) {
    player.digProgress = 0;
    return;
  }
  const layer = player.inTunnel ? "tunnel" : "surface";
  const target = level.digSpots.find(
    (d) => !d.done && d.layer === layer && Math.abs(player.x - d.x) < 72,
  );
  if (!target) {
    player.digProgress = 0;
    return;
  }
  player.digging = true;
  player.digProgress = Math.min(1, player.digProgress + DIG_RATE * dt);
  state.interactHint = `${target.hint} ${Math.floor(player.digProgress * 100)}%`;
  if (player.digProgress < 1) return;

  target.done = true;
  player.digProgress = 0;
  state.stats.digs += 1;
  if (target.clears) {
    const solids = level.tunnelSolids;
    const idx = solids.findIndex((s) => s.id === target.clears);
    if (idx >= 0) solids.splice(idx, 1);
  }
  if (target.goal) MarkGoal(state, target.goal);
  SetSubtitle(state, "高传宝", target.line, 2.4);
}

function BeginHatchTransition(state, goingDown) {
  state.transition = 0.01;
  state._hatchDir = goingDown ? "down" : "up";
}

function FinishHatch(state) {
  const goingDown = state._hatchDir === "down";
  state.player.inTunnel = goingDown;
  state.player.y = goingDown ? state.level.tunnelFloor : state.level.surfaceY;
  state.player.vy = 0;
  state.player.onGround = true;
  SetSubtitle(state, "地道口", goingDown ? "下到地道里。" : "回到地面。", 1.6);
}

function TryInteract(state) {
  const { player, level, input } = state;
  if (!input.interactPressed || state.transition > 0) return;
  state.stats.interactions += 1;

  for (const ent of level.entities) {
    if (ent.hidden || ent.done) continue;
    if (!LayerOk(player, ent)) continue;
    if (!Near(player, ent, ent.radius || 52)) continue;

    if (ent.type === "talk") {
      ent.done = true;
      SetSubtitle(state, ent.speaker, ent.line, 3.4);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "hatch") {
      const goingDown = !player.inTunnel;
      BeginHatchTransition(state, goingDown);
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
      SetSubtitle(state, "林霞", "翻口好了。上去盘问，再引到卡口。", 3.0);
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
      if (!spy || Math.abs(spy.x - ent.x) > 80) {
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
      if (ent.exitTo != null) {
        player.x = ent.exitTo;
        // slip into nearest hatch feeling — stay on surface but move
      }
      return;
    }

    if (ent.type === "charge" || ent.type === "signal") {
      if (ent.needsGoal && !state.goalsDone[ent.needsGoal]) {
        SetSubtitle(state, "提示", ent.type === "charge" ? "先挖开炮楼根土塞。" : "先安放炸药。", 2.2);
        return;
      }
      ent.done = true;
      if (ent.goal) MarkGoal(state, ent.goal);
      SetSubtitle(
        state,
        ent.type === "charge" ? "高传宝" : "赵平原",
        ent.type === "charge" ? "药室安好。上去发信号！" : "总攻——黑风口！",
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
          SetSubtitle(state, "危险", "被发现了——蹲下或钻进地道口。", 2.2);
          if (player.hp <= 0) state.failed = true;
        }
      }
    }
  }
  if (state.subtitleTimer > 0) {
    state.subtitleTimer -= dt;
    if (state.subtitleTimer <= 0) state.subtitle = null;
  }
}

function UpdateCamera(state, dt) {
  const { player, level } = state;
  const targetX = player.x - VIEW_W * 0.38;
  state.cameraX += (Math.max(0, Math.min(level.width - VIEW_W, targetX)) - state.cameraX) * Math.min(1, dt * 6);

  // Vertical framing: keep a Valiant Hearts stage band with sky/soil depth
  const targetY = player.inTunnel ? TUNNEL_FLOOR - 300 : SURFACE_Y - 360;
  state.cameraY += (targetY - state.cameraY) * Math.min(1, dt * 4);
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
  }
}

function AllGoalsDone(state) {
  return Object.values(state.goalsDone).every(Boolean);
}

export function StepPlay(state, dt) {
  if (state.phase !== "play" || state.pauseOpen || state.failed || state.completed) return state;
  const clamped = Math.min(0.033, Math.max(0, dt));

  UpdateTransition(state, clamped);
  ResolvePhysics(state, clamped);
  TryDig(state, clamped);
  TryInteract(state);

  if (!playerDiggingHint(state)) {
    state.interactHint = "";
    for (const dig of state.level.digSpots) {
      const layer = state.player.inTunnel ? "tunnel" : "surface";
      if (!dig.done && dig.layer === layer && Math.abs(state.player.x - dig.x) < 72) {
        state.interactHint = dig.hint;
        break;
      }
    }
    if (!state.interactHint) {
      for (const ent of state.level.entities) {
        if (ent.hidden || ent.done) continue;
        if (!LayerOk(state.player, ent)) continue;
        if (Near(state.player, ent, ent.radius || 52)) {
          state.interactHint = ent.hint || "互动";
          break;
        }
      }
    }
  }

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

function playerDiggingHint(state) {
  return state.player.digging;
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
  // close panels done
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "ending";
    return state;
  }
  const next = CreateCampaignState(state.chapterIndex + 1, {
    unlockedActs: state.unlockedActs,
  });
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
  return {
    v: 2,
    chapterIndex: state.chapterIndex,
    unlockedActs: state.unlockedActs,
  };
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

/** Pure helper: max jump height under current gravity. */
export function JumpApexHeight() {
  return (JUMP_VEL * JUMP_VEL) / (2 * GRAVITY);
}
