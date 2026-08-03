const AudioVersion = "20260804zab";

const AudioAssets = Object.freeze({
  village: new URL(`./Audio/AudioBgm_VillageRuins.ogg?v=${AudioVersion}`, import.meta.url).href,
  covert: new URL(`./Audio/AudioBgm_CovertOperations.mp3?v=${AudioVersion}`, import.meta.url).href,
  bambooSwing: Object.freeze([
    new URL(`./Audio/AudioSfx_BambooSwing01.flac?v=${AudioVersion}`, import.meta.url).href,
    new URL(`./Audio/AudioSfx_BambooSwing02.flac?v=${AudioVersion}`, import.meta.url).href
  ]),
  batonImpact: Object.freeze([
    new URL(`./Audio/AudioSfx_BatonImpact01.flac?v=${AudioVersion}`, import.meta.url).href,
    new URL(`./Audio/AudioSfx_BatonImpact02.flac?v=${AudioVersion}`, import.meta.url).href
  ])
});

const Clamp01 = (value) => Math.max(0, Math.min(1, value));

function CreateMediaElement(url, loop = false) {
  const element = document.createElement("audio");
  element.src = url;
  element.preload = "auto";
  element.loop = loop;
  element.playsInline = true;
  element.volume = 0;
  return element;
}

function CreateSamplePool(url, size = 3) {
  const voices = Array.from({ length: size }, () => CreateMediaElement(url));
  let cursor = 0;
  return {
    Play(volume = 1, playbackRate = 1) {
      const voice = voices[cursor++ % voices.length];
      voice.pause();
      voice.currentTime = 0;
      voice.volume = Clamp01(volume);
      voice.playbackRate = Math.max(.7, Math.min(1.35, playbackRate));
      voice.play().catch(() => {});
    },
    Prime() {
      voices.forEach((voice) => voice.load());
    }
  };
}

function ReadMutedSetting() {
  try { return localStorage.getItem("earthveins1942_audio_v1") === "muted"; }
  catch { return false; }
}

function WriteMutedSetting(muted) {
  try { localStorage.setItem("earthveins1942_audio_v1", muted ? "muted" : "audible"); }
  catch { /* Audio remains usable when storage is unavailable. */ }
}

export function CreateEarthVeinsAudioDirector() {
  const music = {
    village: CreateMediaElement(AudioAssets.village, true),
    covert: CreateMediaElement(AudioAssets.covert, true)
  };
  const samples = {
    bambooSwing: AudioAssets.bambooSwing.map((url) => CreateSamplePool(url, 2)),
    batonImpact: AudioAssets.batonImpact.map((url) => CreateSamplePool(url, 3))
  };
  let muted = ReadMutedSetting();
  let unlocked = false;
  let audioContext = null;
  let masterGain = null;
  let cueIndex = 0;
  let button = null;

  function EnsureContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = muted ? 0 : .72;
      masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function SyncButton() {
    if (!button) return;
    button.textContent = muted ? "静" : "声";
    button.title = muted ? "打开音乐与音效" : "静音";
    button.setAttribute("aria-label", button.title);
    button.classList.toggle("muted", muted);
  }

  function SyncDiagnostics(activeTrack = "none") {
    if (!button) return;
    const active = music[activeTrack];
    button.dataset.audioUnlocked = String(unlocked);
    button.dataset.audioContext = audioContext?.state || "uninitialized";
    button.dataset.audioTrack = activeTrack;
    button.dataset.audioPlaying = String(Boolean(active && !active.paused && active.volume > .001));
    button.dataset.audioVolume = active ? active.volume.toFixed(4) : "0.0000";
  }

  function Unlock() {
    unlocked = true;
    EnsureContext();
    Object.values(music).forEach((track) => {
      track.volume = 0;
      track.play().catch(() => {});
    });
    Object.values(samples).flat().forEach((pool) => pool.Prime());
  }

  function SetMuted(nextMuted) {
    muted = Boolean(nextMuted);
    WriteMutedSetting(muted);
    if (!muted) Unlock();
    if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : .72, audioContext.currentTime, .035);
    SyncButton();
  }

  function BindButton(element) {
    button = element;
    SyncButton();
    button?.addEventListener("click", () => SetMuted(!muted));
  }

  function TrackFor(gameState) {
    if (!gameState || gameState.mode === "title") return "village";
    if (gameState.levelIndex === 0 && (gameState.phaseId === "defense" || gameState.raid?.active)) return "covert";
    return gameState.levelIndex <= 1 ? "village" : "covert";
  }

  function Update(delta, gameState) {
    const desiredTrack = TrackFor(gameState);
    const hidden = document.visibilityState === "hidden";
    const cinematicDuck = gameState?.takedown || gameState?.cinematic || gameState?.caught;
    const combatLift = gameState?.levelIndex === 3 && gameState?.combat?.alarm ? 1.18 : 1;
    const baseVolume = desiredTrack === "village" ? .145 : .125;
    const desiredVolume = !unlocked || muted || hidden ? 0 : baseVolume * combatLift * (cinematicDuck ? .34 : 1);
    const blend = 1 - Math.pow(.008, Math.max(.001, delta));
    Object.entries(music).forEach(([id, track]) => {
      const target = id === desiredTrack ? desiredVolume : 0;
      track.volume = Clamp01(track.volume + (target - track.volume) * blend);
      if (unlocked && !muted && track.paused) track.play().catch(() => {});
      if (track.volume < .001 && id !== desiredTrack && !track.paused) track.pause();
    });
    SyncDiagnostics(desiredTrack);
  }

  function CreateNoise(duration, gainAmount, filterType = "lowpass", filterFrequency = 1200, startOffset = 0) {
    const ctx = EnsureContext();
    if (!ctx || !masterGain || muted) return;
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = Math.pow(1 - index / frameCount, 2.4);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    const startTime = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(gainAmount, startTime);
    gain.gain.exponentialRampToValueAtTime(.0001, startTime + duration);
    source.connect(filter).connect(gain).connect(masterGain);
    source.start(startTime);
  }

  function CreateTone(type, frequency, endFrequency, duration, gainAmount, startOffset = 0) {
    const ctx = EnsureContext();
    if (!ctx || !masterGain || muted) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = ctx.currentTime + startOffset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startTime + duration);
    gain.gain.setValueAtTime(gainAmount, startTime);
    gain.gain.exponentialRampToValueAtTime(.0001, startTime + duration);
    oscillator.connect(gain).connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + .02);
  }

  function PlaySyntheticCue(name) {
    if (!unlocked || muted) return;
    if (name === "bell") {
      [[620, .14], [930, .08], [1510, .045]].forEach(([frequency, gain]) => CreateTone("sine", frequency, frequency * .985, 1.85, gain));
    } else if (name === "whistle") {
      CreateTone("sine", 1320, 1850, .28, .11);
      CreateTone("sine", 1760, 1530, .2, .09, .33);
      CreateTone("sine", 1360, 1940, .42, .1, .62);
    } else if (name === "dogBark") {
      CreateNoise(.15, .14, "bandpass", 460);
      CreateTone("sawtooth", 210, 82, .16, .1);
      CreateNoise(.12, .12, "bandpass", 390, .2);
      CreateTone("sawtooth", 185, 76, .14, .085, .2);
    } else if (name === "firecracker") {
      [0, .11, .23, .38].forEach((offset, index) => CreateNoise(.12, .17 - index * .018, "highpass", 760, offset));
    } else if (name === "rifle") {
      CreateNoise(.19, .3, "highpass", 680);
      CreateTone("triangle", 118, 42, .24, .18);
    } else if (name === "grenade") {
      CreateNoise(.72, .33, "lowpass", 520);
      CreateTone("sine", 86, 28, .82, .28);
    } else if (name === "mechanism") {
      CreateNoise(.09, .11, "bandpass", 930);
      CreateTone("triangle", 240, 120, .22, .08);
    } else if (name === "pickup") {
      CreateTone("triangle", 420, 610, .12, .055);
      CreateTone("sine", 690, 760, .1, .035, .06);
    } else if (name === "bodyHit") {
      CreateNoise(.13, .16, "lowpass", 420);
      CreateTone("sine", 92, 48, .18, .13);
    }
  }

  function PlayCue(name) {
    if (!unlocked || muted) return;
    if (name === "batonSwing") {
      const pool = samples.bambooSwing[cueIndex++ % samples.bambooSwing.length];
      pool.Play(.78, .96 + Math.random() * .08);
      return;
    }
    if (name === "batonImpact") {
      samples.batonImpact[0].Play(.72, .94);
      samples.batonImpact[1].Play(.42, 1.04);
      PlaySyntheticCue("bodyHit");
      return;
    }
    PlaySyntheticCue(name);
  }

  function DebugState() {
    return {
      unlocked,
      muted,
      contextState: audioContext?.state || "uninitialized",
      tracks: Object.fromEntries(Object.entries(music).map(([id, track]) => [id, {
        paused: track.paused,
        volume: Number(track.volume.toFixed(4)),
        readyState: track.readyState
      }]))
    };
  }

  return Object.freeze({ BindButton, Unlock, Update, PlayCue, SetMuted, IsMuted: () => muted, DebugState });
}
