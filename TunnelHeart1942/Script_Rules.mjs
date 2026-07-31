import { CHAPTERS, SAVE_KEY } from "./Data_Story.mjs";
import { BuildLevel } from "./Script_World.mjs";

export const PLAYER_W = 28;
export const PLAYER_H = 46;
export const GRAVITY = 2200;
export const MOVE_SPEED = 210;
export const JUMP_VEL = 620;
export const DIG_RATE = 0.55;

/**
 * @param {number} chapterIndex
 * @param {object} [progress]
 */
export function CreateCampaignState(chapterIndex = 0, progress = null) {
  const safeIndex = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex | 0));
  const chapter = CHAPTERS[safeIndex];
  const level = BuildLevel(chapter.id);
  return {
    phase: "title",
    chapterIndex: safeIndex,
    chapterId: chapter.id,
    goalsDone: Object.fromEntries((chapter.goals || []).map((g) => [g, false])),
    collectedCards: progress?.collectedCards ? { ...progress.collectedCards } : {},
    unlockedActs: progress?.unlockedActs || 1,
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      crouching: false,
      digging: false,
      digProgress: 0,
      hp: 3,
      invuln: 0,
      inTunnel: !!level.startInTunnel,
      carrying: null,
    },
    cameraX: 0,
    level,
    interactHint: "",
    subtitle: null,
    subtitleTimer: 0,
    raidTimer: 0,
    winTimer: 0,
    failed: false,
    completed: false,
    historyOpen: false,
    pauseOpen: false,
    briefingIndex: 0,
    outroIndex: 0,
    input: CreateInputState(),
    stats: {
      digs: 0,
      interactions: 0,
      shots: 0,
      villagersSaved: progress?.villagersSaved || 0,
    },
  };
}

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
    pausePressed: false,
  };
}

export function CloneInput(input) {
  return { ...input };
}

export function RectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function PlayerAabb(player) {
  const h = player.crouching ? PLAYER_H * 0.72 : PLAYER_H;
  return {
    x: player.x - PLAYER_W / 2,
    y: player.y - h,
    w: PLAYER_W,
    h,
  };
}

function SolidAt(level, x, y, inTunnel) {
  const solids = inTunnel ? level.tunnelSolids : level.surfaceSolids;
  for (const s of solids) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  return null;
}

function ResolvePhysics(state, dt) {
  const { player, level, input } = state;
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
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const worldW = level.width;
  player.x = Math.max(18, Math.min(worldW - 18, player.x));

  const aabb = PlayerAabb(player);
  const solids = player.inTunnel ? level.tunnelSolids : level.surfaceSolids;
  player.onGround = false;
  for (const s of solids) {
    if (!RectsOverlap(aabb, s)) continue;
    const prevY = player.y - player.vy * dt;
    const prevBottom = prevY;
    if (player.vy >= 0 && prevBottom <= s.y + 4) {
      player.y = s.y;
      player.vy = 0;
      player.onGround = true;
      aabb.y = player.y - aabb.h;
    } else if (player.vy < 0 && prevY - aabb.h >= s.y + s.h - 4) {
      player.y = s.y + s.h + aabb.h;
      player.vy = 0;
      aabb.y = player.y - aabb.h;
    } else {
      if (player.vx > 0) player.x = s.x - PLAYER_W / 2;
      if (player.vx < 0) player.x = s.x + s.w + PLAYER_W / 2;
    }
  }

  const floorY = player.inTunnel ? level.tunnelFloor : level.surfaceFloor;
  if (player.y > floorY) {
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
}

function Near(player, ent, radius = 42) {
  const dx = player.x - (ent.x + (ent.w || 0) / 2);
  const dy = player.y - (ent.y + (ent.h || 0));
  return Math.hypot(dx, dy) < radius;
}

function MarkGoal(state, goalId) {
  if (!Object.prototype.hasOwnProperty.call(state.goalsDone, goalId)) return;
  if (state.goalsDone[goalId]) return;
  state.goalsDone[goalId] = true;
  state.subtitle = { speaker: "任务", text: "进度更新" };
  state.subtitleTimer = 1.4;
}

function AllGoalsDone(state) {
  return Object.values(state.goalsDone).every(Boolean);
}

function SetSubtitle(state, speaker, text, time = 3.2) {
  state.subtitle = { speaker, text };
  state.subtitleTimer = time;
}

function TryDig(state, dt) {
  const { player, level, input } = state;
  player.digging = false;
  if (!input.dig || !player.onGround) {
    player.digProgress = 0;
    return;
  }
  const spots = level.digSpots.filter((d) => !d.done && d.tunnel === !!player.inTunnel);
  let target = null;
  for (const dig of spots) {
    if (Math.abs(player.x - dig.x) < 36 && Math.abs(player.y - dig.y) < 54) {
      target = dig;
      break;
    }
  }
  if (!target) {
    player.digProgress = 0;
    return;
  }
  player.digging = true;
  player.digProgress = Math.min(1, player.digProgress + DIG_RATE * dt);
  state.interactHint = `挖掘中… ${Math.floor(player.digProgress * 100)}%`;
  if (player.digProgress < 1) return;

  target.done = true;
  player.digProgress = 0;
  state.stats.digs += 1;
  if (target.opensPassage) {
    const solids = player.inTunnel ? level.tunnelSolids : level.surfaceSolids;
    const idx = solids.findIndex((s) => s.id === target.opensPassage);
    if (idx >= 0) solids.splice(idx, 1);
  }
  if (target.reveals) {
    for (const ent of level.entities) {
      if (ent.id === target.reveals) ent.hidden = false;
    }
  }
  if (target.goal) MarkGoal(state, target.goal);
  SetSubtitle(state, "高传宝", target.line || "通了。", 2.4);
}

function TryInteract(state) {
  const { player, level, input } = state;
  if (!input.interactPressed) return;
  state.stats.interactions += 1;

  for (const ent of level.entities) {
    if (ent.hidden || ent.done) continue;
    if (!Near(player, ent, ent.radius || 48)) continue;
    if (ent.requiresTunnel != null && !!player.inTunnel !== !!ent.requiresTunnel) continue;

    if (ent.type === "talk") {
      ent.done = true;
      SetSubtitle(state, ent.speaker, ent.line, 3.6);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "hatch") {
      player.inTunnel = !player.inTunnel;
      player.y = player.inTunnel ? level.tunnelFloor - 2 : level.surfaceFloor - 2;
      player.vy = 0;
      SetSubtitle(state, "地道口", player.inTunnel ? "钻进了地道。" : "回到地面。", 1.8);
      if (ent.goal) MarkGoal(state, ent.goal);
      return;
    }

    if (ent.type === "shelter") {
      if (ent.done) continue;
      ent.done = true;
      const pending = level.entities.filter((e) => e.type === "shelter" && !e.done).length;
      state.stats.villagersSaved += 1;
      SetSubtitle(state, "乡亲", ent.line || "进洞了！", 2.2);
      if (pending === 0) MarkGoal(state, "shelter_villagers");
      return;
    }

    if (ent.type === "bell") {
      ent.done = true;
      ent.ringing = true;
      MarkGoal(state, "ring_bell");
      MarkGoal(state, "survive_raid");
      SetSubtitle(state, "高老忠", "快进洞——钟，我来敲！", 3.8);
      state.raidTimer = 2.5;
      return;
    }

    if (ent.type === "flip_build") {
      ent.done = true;
      for (const flip of level.entities) {
        if (flip.type === "flip_trap") flip.armed = true;
      }
      MarkGoal(state, "build_flip");
      SetSubtitle(state, "林霞", "翻口好了。引他们过来。", 3.0);
      return;
    }

    if (ent.type === "spy_talk") {
      ent.done = true;
      MarkGoal(state, "expose_spy");
      SetSubtitle(state, "高传宝", "武工队从东沟来——你们怎么从炮楼方向进庄？", 3.6);
      for (const spy of level.entities) {
        if (spy.type === "spy") spy.exposed = true;
      }
      return;
    }

    if (ent.type === "flip_trap") {
      if (!ent.armed) {
        SetSubtitle(state, "提示", "先把翻口修好。", 2.0);
        return;
      }
      const spy = level.entities.find((e) => e.type === "spy" && e.exposed && !e.trapped);
      if (!spy || Math.abs(spy.x - ent.x) > 70) {
        SetSubtitle(state, "提示", "等特务走到翻口上方。", 2.0);
        return;
      }
      spy.trapped = true;
      ent.done = true;
      MarkGoal(state, "trap_spy");
      SetSubtitle(state, "民兵", "翻口——上！", 2.8);
      return;
    }

    if (ent.type === "shot_port") {
      if (ent.cooled) return;
      ent.cooled = true;
      ent.shots = (ent.shots || 0) + 1;
      state.stats.shots += 1;
      const patrol = level.entities.find((e) => e.type === "patrol" && !e.broken);
      if (patrol) {
        patrol.hits = (patrol.hits || 0) + 1;
        if (patrol.hits >= 3) {
          patrol.broken = true;
          MarkGoal(state, "break_patrol");
        }
      }
      const portsUsed = level.entities.filter((e) => e.type === "shot_port" && e.shots > 0).length;
      if (portsUsed >= 3) MarkGoal(state, "exit_shots");
      MarkGoal(state, "keep_safe");
      SetSubtitle(state, "高传宝", "打一枪，换一个地方！", 2.0);
      player.x = ent.exitTo ?? player.x + player.facing * 120;
      return;
    }

    if (ent.type === "charge") {
      if (!level.entities.some((e) => e.type === "dig_marker" && e.done)) {
        SetSubtitle(state, "提示", "先把地道挖到炮楼底下。", 2.2);
        return;
      }
      ent.done = true;
      MarkGoal(state, "plant_charge");
      SetSubtitle(state, "高传宝", "药室安好。上去发信号！", 2.8);
      return;
    }

    if (ent.type === "signal") {
      if (!state.goalsDone.plant_charge) {
        SetSubtitle(state, "提示", "先安放炸药。", 2.0);
        return;
      }
      ent.done = true;
      MarkGoal(state, "signal_assault");
      SetSubtitle(state, "赵平原", "总攻——黑风口！", 3.2);
      return;
    }

    if (ent.type === "history") {
      state.collectedCards[ent.cardId] = true;
      ent.done = true;
      SetSubtitle(state, "史实卡片", ent.title || "已收入手册", 2.4);
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
      const dir = Math.sign(trap.x - ent.x) || 1;
      ent.x += dir * 55 * dt;
    }
    if (ent.type === "patrol" && !ent.broken) {
      ent.t = (ent.t || 0) + dt;
      ent.x = ent.homeX + Math.sin(ent.t * 0.7) * (ent.patrolAmp || 90);
      if (player.invuln <= 0 && !player.inTunnel && !player.crouching) {
        if (Math.abs(player.x - ent.x) < 40 && Math.abs(player.y - ent.y) < 50) {
          player.hp -= 1;
          player.invuln = 1.2;
          player.vy = -280;
          SetSubtitle(state, "危险", "被巡逻发现了——钻进地道或蹲下隐蔽。", 2.4);
          if (player.hp <= 0) state.failed = true;
        }
      }
    }
    if (ent.type === "dig_marker" && ent.linkedDig) {
      const dig = level.digSpots.find((d) => d.id === ent.linkedDig);
      if (dig?.done && !ent.done) {
        ent.done = true;
        MarkGoal(state, "dig_under");
      }
    }
  }

  if (state.raidTimer > 0) {
    state.raidTimer -= dt;
    if (state.raidTimer <= 0 && state.chapterId === "act2_bell") {
      // scripted sacrifice beat already marked via bell
    }
  }

  if (state.subtitleTimer > 0) {
    state.subtitleTimer -= dt;
    if (state.subtitleTimer <= 0) state.subtitle = null;
  }
}

export function StepPlay(state, dt) {
  if (state.phase !== "play" || state.pauseOpen || state.failed || state.completed) return state;
  const clamped = Math.min(0.033, Math.max(0, dt));
  ResolvePhysics(state, clamped);
  TryDig(state, clamped);
  TryInteract(state);

  // refresh hint
  if (!state.player.digging) {
    state.interactHint = "";
    for (const ent of state.level.entities) {
      if (ent.hidden || ent.done) continue;
      if (Near(state.player, ent, ent.radius || 48)) {
        if (ent.requiresTunnel != null && !!state.player.inTunnel !== !!ent.requiresTunnel) continue;
        state.interactHint = ent.hint || "互动";
        break;
      }
    }
    for (const dig of state.level.digSpots) {
      if (dig.done || dig.tunnel !== !!state.player.inTunnel) continue;
      if (Math.abs(state.player.x - dig.x) < 36) {
        state.interactHint = dig.hint || "按住挖掘";
        break;
      }
    }
  }

  UpdateActors(state, clamped);

  const viewW = state.level.viewWidth || 960;
  state.cameraX = Math.max(0, Math.min(state.level.width - viewW, state.player.x - viewW * 0.38));

  if (AllGoalsDone(state) && !state.completed) {
    state.winTimer += clamped;
    if (state.winTimer > 1.1) {
      state.completed = true;
      state.phase = "outro";
      state.outroIndex = 0;
      state.unlockedActs = Math.max(state.unlockedActs, state.chapterIndex + 2);
    }
  } else {
    state.winTimer = 0;
  }

  // clear one-frame presses
  state.input.jumpPressed = false;
  state.input.interactPressed = false;
  state.input.pausePressed = false;
  return state;
}

export function AdvanceBriefing(state) {
  const chapter = CHAPTERS[state.chapterIndex];
  if (state.briefingIndex < chapter.briefing.length - 1) {
    state.briefingIndex += 1;
    return state;
  }
  state.phase = "play";
  return state;
}

export function AdvanceOutro(state) {
  const chapter = CHAPTERS[state.chapterIndex];
  if (state.outroIndex < chapter.outro.length - 1) {
    state.outroIndex += 1;
    return state;
  }
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "ending";
    return state;
  }
  const next = CreateCampaignState(state.chapterIndex + 1, {
    collectedCards: state.collectedCards,
    unlockedActs: state.unlockedActs,
    villagersSaved: state.stats.villagersSaved,
  });
  next.phase = "briefing";
  next.briefingIndex = 0;
  return next;
}

export function RestartChapter(state) {
  const next = CreateCampaignState(state.chapterIndex, {
    collectedCards: state.collectedCards,
    unlockedActs: state.unlockedActs,
    villagersSaved: state.stats.villagersSaved,
  });
  next.phase = "briefing";
  return next;
}

export function SerializeProgress(state) {
  return {
    v: 1,
    chapterIndex: state.chapterIndex,
    unlockedActs: state.unlockedActs,
    collectedCards: state.collectedCards,
    villagersSaved: state.stats.villagersSaved,
  };
}

export function LoadProgress(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    chapterIndex: Math.max(0, Math.min(CHAPTERS.length - 1, raw.chapterIndex | 0)),
    unlockedActs: Math.max(1, raw.unlockedActs | 0),
    collectedCards: raw.collectedCards || {},
    villagersSaved: raw.villagersSaved | 0,
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
    if (!raw) return null;
    return LoadProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Deterministic helper for smoke tests: complete a named goal via interact/dig simulation. */
export function DebugCompleteGoal(state, goalId) {
  MarkGoal(state, goalId);
  return state;
}

export function GoalsRemaining(state) {
  return Object.entries(state.goalsDone)
    .filter(([, done]) => !done)
    .map(([id]) => id);
}
