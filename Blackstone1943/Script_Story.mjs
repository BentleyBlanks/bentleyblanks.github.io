/**
 * Script_Story.mjs — 剧情导演 + 小满伴随 AI + 字幕调度
 * Owner: AgentStory
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的签名占位**：节拍/台词/伴随都只做最小可运行版本。
 *   AgentStory 接管后整体替换。
 *
 * 纪律：不 import three / Character / World，一切通过 ctx。
 * 小满不做随机播报：台词必须与玩家行为呼应；她永远不是资源、不计分（红线三）。
 */

import { Config } from './Script_Config.mjs';
import { EventNames } from './Script_Event.mjs';
import { FindChapter, FindBeat, GetLine, GetBarks } from './Data_Story.mjs';

function EstimateDuration(text) {
  const seconds = text.length * Config.Hud.subtitleCharSeconds;
  return Math.max(Config.Hud.subtitleMinSeconds, Math.min(8, seconds));
}

function CreateCompanion(ctx) {
  const world = ctx.world;
  const spawn = world && world.spawns ? world.spawns.companionStart : null;
  const character = ctx.characters ? ctx.characters.Spawn('FengXiaoman', { id: 'CompanionXiaoman' }) : null;
  const position = character ? character.group.position : { x: 0, y: 0, z: 0 };
  if (character && spawn) character.Warp(spawn.position, spawn.yaw);

  const state = { hidden: false, scared: 0.35, trust: 0.1, tired: 0, carrying: null, busy: false };
  let mode = 'Follow';
  let yaw = spawn ? spawn.yaw : 0;

  const companion = {
    character: character,
    position: position,
    mode: mode,
    state: state,

    SetMode(nextMode) { mode = nextMode; companion.mode = nextMode; },
    GetMode() { return mode; },
    CommandFollow() { companion.SetMode('Follow'); return true; },
    CommandStay() { companion.SetMode('Stay'); return true; },
    CommandHide() { companion.SetMode('Hide'); state.hidden = true; return true; },
    CommandInteract() { return false; },
    CanReach() { return false; },
    GiveItem() { return false; },
    RequestItem() { return false; },

    IsHidden() { return state.hidden; },
    IsSafe() { return state.scared < 0.5; },
    GetDistanceToPlayer() {
      if (!ctx.player || !character) return 0;
      return ctx.player.position.distanceTo(character.group.position);
    },
    GetStealthProfile() {
      return {
        position: position, eyePosition: position,
        height: character ? character.height : 1.36,
        moving: false, speed: 0, crouched: state.hidden, prone: false,
        inCover: state.hidden, concealment: state.hidden ? 0.6 : 0.2,
        lightLevel: 0.5, indoors: false,
      };
    },
    ApplyScare(amount) { state.scared = Math.max(0, Math.min(1, state.scared + amount)); },
    Capture(byEnemyId) {
      companion.SetMode('Captured');
      ctx.bus.Emit(EventNames.CompanionCaptured, { byEnemyId: byEnemyId, position: position });
    },
    Rescue() { companion.SetMode('Follow'); },
    Teleport(target, newYaw) {
      if (character) character.Warp(target, newYaw === undefined ? yaw : newYaw);
      if (newYaw !== undefined) yaw = newYaw;
    },

    Update(dt) {
      if (!character || !ctx.player || dt <= 0) return;
      state.scared = Math.max(0, state.scared - Config.Companion.scareDecayPerSecond * dt);

      if (mode === 'Follow') {
        const target = ctx.player.position;
        const dx = target.x - character.group.position.x;
        const dz = target.z - character.group.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        let speed = 0;
        if (distance > Config.Companion.followDistance) {
          speed = distance > Config.Companion.catchUpDistance
            ? Config.Companion.catchUpSpeed : Config.Companion.walkSpeed;
          const step = Math.min(speed * dt, Math.max(0, distance - Config.Companion.followDistance * 0.8));
          const nextX = character.group.position.x + (dx / distance) * step;
          const nextZ = character.group.position.z + (dz / distance) * step;
          const height = ctx.world ? ctx.world.SampleHeight(nextX, nextZ) : 0;
          character.group.position.set(nextX, height, nextZ);
          yaw = Math.atan2(-dx, -dz);
        }
        character.SetYaw(yaw);
        character.SetLocomotion({
          speed: speed, strafe: 0, turnRate: 0, crouch: ctx.player.state.stance !== 'Stand',
          prone: false, aiming: false, injured: 0, carrying: false, grounded: true, surface: 'Snow',
        });
        character.SetTension(state.scared);
        character.SetLookAt(ctx.player.position, 0.7);
      }
    },
  };

  return companion;
}

export function CreateStory(ctx, options) {
  const settings = options || {};
  const bus = ctx.bus;
  const queue = [];
  const barkCooldowns = new Map();
  let companion = null;
  let speakingSeconds = 0;
  let currentLine = null;
  let cinematic = false;
  let companionReportSeconds = 0;

  const story = {
    chapterId: settings.chapterId || 'ChapterSnowCellar',
    beatId: null,
    companion: null,

    StartChapter(chapterId) {
      story.chapterId = chapterId;
      const chapter = FindChapter(chapterId);
      if (chapter && chapter.companionPresent && !companion) {
        companion = CreateCompanion(ctx);
        story.companion = companion;
      }
      if (chapter && chapter.introBeatId) story.TriggerBeat(chapter.introBeatId);
    },
    GetChapterData() { return FindChapter(story.chapterId); },
    TriggerBeat(beatId, beatOptions) {
      const beat = FindBeat(beatId);
      if (!beat) return false;
      if (!(beatOptions && beatOptions.force) && ctx.rules && ctx.rules.IsBeatDone(beatId)) return false;
      if (ctx.rules) ctx.rules.MarkBeat(beatId);
      story.beatId = beatId;
      if (beat.lines && beat.lines.length > 0) story.QueueDialogue(beat.lines);
      if (beat.companionMode && companion) companion.SetMode(beat.companionMode);
      if (beat.musicState && ctx.audio) ctx.audio.SetMusicState(beat.musicState);
      if (beat.ledger && ctx.rules) {
        for (let i = 0; i < beat.ledger.length; i += 1) ctx.rules.RecordCost(beat.ledger[i], '');
      }
      bus.Emit(EventNames.StoryBeat, { id: beatId, chapterId: story.chapterId });
      return true;
    },
    IsBeatDone(beatId) { return ctx.rules ? ctx.rules.IsBeatDone(beatId) : false; },
    GetActiveBeat() { return story.beatId ? FindBeat(story.beatId) : null; },

    Say(speaker, lineIdOrText, sayOptions) {
      const line = GetLine(lineIdOrText);
      const text = line ? line.text : lineIdOrText;
      const who = line ? line.speaker : speaker;
      const duration = (sayOptions && sayOptions.duration) || (line && line.duration) || EstimateDuration(text);
      currentLine = { speaker: who, text: text, duration: duration, emotion: line ? line.emotion : 'Flat' };
      speakingSeconds = duration;
      bus.Emit(EventNames.Subtitle, currentLine);
      return true;
    },
    QueueDialogue(lineIds, queueOptions) {
      const gap = (queueOptions && queueOptions.gap) || 0.35;
      for (let i = 0; i < lineIds.length; i += 1) queue.push({ lineId: lineIds[i], gap: gap });
    },
    SkipDialogue() { speakingSeconds = 0; queue.length = 0; },
    IsSpeaking() { return speakingSeconds > 0; },
    RequestBark(barkId) {
      const now = ctx.elapsed;
      const until = barkCooldowns.get(barkId) || 0;
      if (now < until) return false;
      const lines = GetBarks(barkId);
      if (lines.length === 0) return false;
      barkCooldowns.set(barkId, now + Config.Companion.barkCooldownSeconds);
      story.Say('Xiaoman', lines[0]);
      return true;
    },
    SetBarkCooldown(barkId, seconds) { barkCooldowns.set(barkId, ctx.elapsed + seconds); },

    OfferChoice(choiceId) { return Promise.resolve(ctx.rules ? ctx.rules.GetChoice(choiceId) : null); },
    MakeChoice(choiceId, optionId) { if (ctx.rules) ctx.rules.RecordChoice(choiceId, optionId); },
    GetChoice(choiceId) { return ctx.rules ? ctx.rules.GetChoice(choiceId) : null; },

    PlayCinematic() { return Promise.resolve(); },
    SetLetterbox(on) { cinematic = !!on; if (ctx.art) ctx.art.SetLetterbox(on); },
    IsCinematic() { return cinematic; },

    Update(dt) {
      if (dt <= 0) return;
      if (speakingSeconds > 0) speakingSeconds = Math.max(0, speakingSeconds - dt);
      else if (queue.length > 0) {
        const next = queue.shift();
        story.Say(null, next.lineId);
      }
      if (companion) {
        companion.Update(dt, ctx);
        /* HUD 只需要低频状态；每帧 Emit 是浪费（每帧预算 0.8ms） */
        companionReportSeconds += dt;
        if (companionReportSeconds >= 0.25) {
          companionReportSeconds = 0;
          bus.Emit(EventNames.CompanionState, {
            mode: companion.mode, hidden: companion.state.hidden,
            scared: companion.state.scared, distance: companion.GetDistanceToPlayer(),
            busy: companion.state.busy,
          });
        }
      }
    },

    Dispose() {
      if (companion && companion.character && ctx.characters) ctx.characters.Despawn(companion.character);
      companion = null;
      story.companion = null;
      queue.length = 0;
      barkCooldowns.clear();
    },
  };

  return story;
}

export default CreateStory;
