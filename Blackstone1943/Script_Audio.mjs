/**
 * Script_Audio.mjs — WebAudio 程序化音效与音乐（零音频文件）
 * Owner: AgentInterface
 *
 * ⚠ 本文件目前是 **AgentBoot 铺设的签名占位**：总线与 API 齐全，只合成了很少几种声音，
 *   未 Unlock 前所有播放静默返回 null。AgentInterface 接管后整体替换。
 *
 * 无障碍：关键声音必须发 SoundCaption 事件供方向字幕（质量门槛 8）。
 */

import { Config } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';
import { EventNames } from './Script_Event.mjs';

export const SfxIds = Object.freeze({
  FootstepSnow: 'FootstepSnow', FootstepIce: 'FootstepIce', FootstepWood: 'FootstepWood',
  FootstepStone: 'FootstepStone', FootstepStraw: 'FootstepStraw', FootstepWater: 'FootstepWater',
  RifleFire: 'RifleFire', RifleBolt: 'RifleBolt', RifleReload: 'RifleReload', PistolFire: 'PistolFire',
  MeleeSwing: 'MeleeSwing', MeleeHitFlesh: 'MeleeHitFlesh', MeleeHitWood: 'MeleeHitWood', MeleeBlock: 'MeleeBlock',
  GrenadePin: 'GrenadePin', GrenadeBounce: 'GrenadeBounce', Explosion: 'Explosion', BulletWhizz: 'BulletWhizz',
  ImpactSnow: 'ImpactSnow', ImpactWood: 'ImpactWood', ImpactStone: 'ImpactStone', ImpactMetal: 'ImpactMetal',
  DryFire: 'DryFire',
  DoorOpen: 'DoorOpen', DoorForce: 'DoorForce', DrawerOpen: 'DrawerOpen', JarShift: 'JarShift',
  ClothTear: 'ClothTear', MatchStrike: 'MatchStrike', FireCrackle: 'FireCrackle', CraftDone: 'CraftDone',
  PickUp: 'PickUp', InventoryOpen: 'InventoryOpen',
  Breath: 'Breath', BreathHard: 'BreathHard', Shiver: 'Shiver', Heartbeat: 'Heartbeat',
  BandageApply: 'BandageApply', Eat: 'Eat', Hurt: 'Hurt', HurtHeavy: 'HurtHeavy', Down: 'Down',
  WindLow: 'WindLow', WindHigh: 'WindHigh', SnowFall: 'SnowFall', TreeCreak: 'TreeCreak',
  CrowCall: 'CrowCall', DogBark: 'DogBark', DogGrowl: 'DogGrowl', TruckDistant: 'TruckDistant',
  FlareLaunch: 'FlareLaunch', SearchlightHum: 'SearchlightHum',
  EnemyAlertShort: 'EnemyAlertShort', EnemyAlertLong: 'EnemyAlertLong', EnemyChatter: 'EnemyChatter',
  EnemyWhistle: 'EnemyWhistle', EnemyFootstepSnow: 'EnemyFootstepSnow', BodyFall: 'BodyFall',
  UiMove: 'UiMove', UiConfirm: 'UiConfirm', UiCancel: 'UiCancel', UiObjective: 'UiObjective', UiChapter: 'UiChapter',
});

/** 极简合成表：噪声脉冲 / 正弦点击 / 低频轰。AgentInterface 会换成真正的音色设计。 */
const SfxRecipes = {
  Default: { kind: 'noise', seconds: 0.12, frequency: 900, gain: 0.18 },
  FootstepSnow: { kind: 'noise', seconds: 0.14, frequency: 620, gain: 0.14 },
  FootstepStone: { kind: 'noise', seconds: 0.09, frequency: 1500, gain: 0.16 },
  RifleFire: { kind: 'noise', seconds: 0.35, frequency: 260, gain: 0.5 },
  RifleBolt: { kind: 'click', seconds: 0.12, frequency: 1800, gain: 0.2 },
  UiConfirm: { kind: 'click', seconds: 0.08, frequency: 620, gain: 0.14 },
  UiCancel: { kind: 'click', seconds: 0.08, frequency: 320, gain: 0.14 },
  UiObjective: { kind: 'click', seconds: 0.22, frequency: 480, gain: 0.12 },
  UiChapter: { kind: 'click', seconds: 0.5, frequency: 180, gain: 0.14 },
  DogBark: { kind: 'noise', seconds: 0.2, frequency: 700, gain: 0.3 },
};

const CaptionText = {
  RifleFire: '枪声',
  PistolFire: '枪声',
  Explosion: '爆炸',
  DogBark: '犬吠',
  EnemyAlertShort: '有人喊了一声',
  EnemyAlertLong: '有人在叫人',
  EnemyFootstepSnow: '雪地上的脚步',
  DoorForce: '门被撬开的声音',
  BodyFall: '有东西倒下',
};

export function CreateAudio(ctx, options) {
  const captions = [];
  const volumes = {
    master: Config.Audio.masterVolume, music: Config.Audio.busMusic,
    sfx: Config.Audio.busSfx, ambience: Config.Audio.busAmbience, voice: Config.Audio.busVoice,
  };
  const listener = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
  const loops = [];
  let context = null;
  let masterGain = null;
  let noiseBuffer = null;
  let muted = false;
  let windIntensity = 0.3;
  let musicState = 'Silence';
  let ambienceId = 'Silence';

  function BuildNoiseBuffer() {
    if (!context || noiseBuffer) return;
    const length = Math.floor(context.sampleRate * 1.0);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let value = 0;
    for (let i = 0; i < length; i += 1) {
      /* 粉噪近似：白噪一阶低通，听起来像风与雪，不像嘶嘶电流 */
      value = value * 0.86 + (MathUtil.Hash1(i * 0.37) - 0.5) * 0.28;
      data[i] = value;
    }
  }

  function EmitCaption(id, position) {
    const text = CaptionText[id];
    if (!text) return;
    let direction = 0;
    let distance = 0;
    if (position) {
      const dx = position.x - listener.position.x;
      const dz = position.z - listener.position.z;
      distance = Math.sqrt(dx * dx + dz * dz);
      direction = Math.atan2(dx, dz);
    }
    const entry = { text: text, directionRadians: direction, distance: distance, at: ctx.elapsed };
    captions.push(entry);
    if (captions.length > Config.Hud.soundCaptionMax) captions.shift();
    ctx.bus.Emit(EventNames.SoundCaption, { text: text, directionRadians: direction, distance: distance });
  }

  const audio = {
    ready: false,

    async Unlock() {
      if (audio.ready) return true;
      const Ctor = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!Ctor) return false;
      try {
        context = new Ctor();
        if (context.state === 'suspended') await context.resume();
        masterGain = context.createGain();
        masterGain.gain.value = volumes.master;
        masterGain.connect(context.destination);
        BuildNoiseBuffer();
        audio.ready = true;
        return true;
      } catch (error) {
        context = null;
        audio.ready = false;
        return false;
      }
    },

    PlaySfx(id, sfxOptions) {
      const settings = sfxOptions || {};
      if (settings.caption !== false) EmitCaption(id, settings.position);
      if (!audio.ready || !context || muted) return null;
      const recipe = SfxRecipes[id] || SfxRecipes.Default;
      const now = context.currentTime + (settings.delay || 0);
      const gainNode = context.createGain();
      let volume = (settings.volume === undefined ? 1 : settings.volume) * recipe.gain * volumes.sfx;
      if (settings.position) {
        const dx = settings.position.x - listener.position.x;
        const dz = settings.position.z - listener.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        volume *= MathUtil.Clamp01(1 - distance / Config.Audio.rolloffMaxDistance);
      }
      if (volume <= 0.001) return null;
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + recipe.seconds);
      gainNode.connect(masterGain);

      let source;
      if (recipe.kind === 'noise' && noiseBuffer) {
        source = context.createBufferSource();
        source.buffer = noiseBuffer;
        source.playbackRate.value = (settings.pitch || 1) * (recipe.frequency / 900);
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = recipe.frequency;
        filter.Q.value = 0.8;
        source.connect(filter);
        filter.connect(gainNode);
      } else {
        source = context.createOscillator();
        source.type = 'triangle';
        source.frequency.setValueAtTime(recipe.frequency * (settings.pitch || 1), now);
        source.frequency.exponentialRampToValueAtTime(Math.max(40, recipe.frequency * 0.4), now + recipe.seconds);
        source.connect(gainNode);
      }
      source.start(now);
      source.stop(now + recipe.seconds + 0.02);

      const handle = {
        id: id, done: false,
        Stop() { try { source.stop(); } catch (error) { /* 已经停了 */ } handle.done = true; },
        SetVolume(value) { gainNode.gain.value = value; },
      };
      source.onended = () => { handle.done = true; };
      return handle;
    },

    PlayLoop(id, loopOptions) {
      if (!audio.ready || !context || muted) return null;
      const settings = loopOptions || {};
      const gainNode = context.createGain();
      gainNode.gain.value = (settings.volume === undefined ? 0.2 : settings.volume) * volumes.ambience;
      gainNode.connect(masterGain);
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 480;
      source.connect(filter);
      filter.connect(gainNode);
      source.start();
      const handle = {
        id: id,
        SetPosition() { /* 占位 */ },
        SetVolume(value) { gainNode.gain.value = value; },
        SetPitch(value) { source.playbackRate.value = value; },
        Stop() { try { source.stop(); } catch (error) { /* 已经停了 */ } },
      };
      loops.push(handle);
      return handle;
    },
    StopLoop(handle) {
      if (!handle) return;
      handle.Stop();
      const index = loops.indexOf(handle);
      if (index >= 0) loops.splice(index, 1);
    },
    StopAll() {
      for (let i = loops.length - 1; i >= 0; i -= 1) loops[i].Stop();
      loops.length = 0;
    },

    SetListener(position, forward) {
      if (position) { listener.position.x = position.x; listener.position.y = position.y; listener.position.z = position.z; }
      if (forward) { listener.forward.x = forward.x; listener.forward.y = forward.y; listener.forward.z = forward.z; }
    },
    SetAmbience(presetId) { ambienceId = presetId; },
    SetMusicState(stateId) { musicState = stateId; },
    SetWindIntensity(value) { windIntensity = value; },
    SetMuffled() { /* 占位 */ },
    SetHeartbeat() { /* 占位 */ },

    SetMasterVolume(value) {
      volumes.master = value;
      if (masterGain) masterGain.gain.value = muted ? 0 : value;
    },
    SetBusVolume(bus, value) { volumes[bus] = value; },
    GetVolumes() { return { master: volumes.master, music: volumes.music, sfx: volumes.sfx, ambience: volumes.ambience, voice: volumes.voice }; },
    SetMuted(value) {
      muted = !!value;
      if (masterGain) masterGain.gain.value = muted ? 0 : volumes.master;
    },

    GetSoundCaptions() { return captions.slice(); },

    Update(dt) {
      if (dt <= 0) return;
      for (let i = captions.length - 1; i >= 0; i -= 1) {
        if (ctx.elapsed - captions[i].at > Config.Hud.soundCaptionSeconds) captions.splice(i, 1);
      }
      if (ctx.camera) {
        audio.SetListener(ctx.camera.position, { x: 0, y: 0, z: -1 });
      }
    },

    Dispose() {
      audio.StopAll();
      if (context && context.close) { try { context.close(); } catch (error) { /* 忽略 */ } }
      context = null;
      audio.ready = false;
      captions.length = 0;
    },
  };

  audio.GetMusicState = function GetMusicState() { return musicState; };
  audio.GetAmbience = function GetAmbience() { return ambienceId; };
  audio.GetWindIntensity = function GetWindIntensity() { return windIntensity; };
  if (options && options.muted) audio.SetMuted(true);
  return audio;
}

export default CreateAudio;
