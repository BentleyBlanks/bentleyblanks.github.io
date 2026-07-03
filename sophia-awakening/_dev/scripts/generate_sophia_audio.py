from __future__ import annotations

import json
import math
import random
import shutil
import wave
from pathlib import Path


SR = 44_100
TWO_PI = math.pi * 2
RNG = random.Random(7349)

DEV_ROOT = Path(__file__).resolve().parents[1]
GAME_ROOT = DEV_ROOT.parent
REPO_ROOT = GAME_ROOT.parent
PUBLIC_AUDIO = DEV_ROOT / "public" / "assets" / "audio" / "sophia"
PUBLISHED_AUDIO = GAME_ROOT / "assets" / "audio" / "sophia"
PICKER_COPY = REPO_ROOT / "tmp" / "sophia-audio-picks"


def empty(seconds: float) -> list[float]:
    return [0.0] * int(round(seconds * SR))


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def env_shape(t: float, attack: float, release: float, curve: float = 1.0) -> float:
    if attack > 0 and t < attack:
        return (t / attack) ** curve
    if release > 0 and t > 1.0 - release:
        return ((1.0 - t) / release) ** curve
    return 1.0


def osc(phase: float, waveform: str) -> float:
    if waveform == "sine":
        return math.sin(phase)
    if waveform == "triangle":
        return (2.0 / math.pi) * math.asin(math.sin(phase))
    if waveform == "square":
        return 1.0 if math.sin(phase) >= 0 else -1.0
    if waveform == "saw":
        return 2.0 * ((phase / TWO_PI) % 1.0) - 1.0
    return math.sin(phase)


def add_tone(
    buf: list[float],
    start: float,
    dur: float,
    freq: float,
    *,
    end_freq: float | None = None,
    amp: float = 0.2,
    waveform: str = "sine",
    attack: float = 0.01,
    release: float = 0.08,
    decay: float = 0.0,
    vibrato: float = 0.0,
    tremolo: float = 0.0,
) -> None:
    start_i = max(0, int(round(start * SR)))
    n = max(1, int(round(dur * SR)))
    end_i = min(len(buf), start_i + n)
    phase = 0.0
    ratio = (end_freq or freq) / freq if freq > 0 else 1.0
    for i in range(start_i, end_i):
        j = i - start_i
        p = j / max(1, n - 1)
        if end_freq is None:
            current = freq
        else:
            current = freq * (ratio**p)
        if vibrato:
            current *= 1.0 + math.sin(TWO_PI * 5.2 * j / SR) * vibrato
        phase += TWO_PI * current / SR
        env = env_shape(p, attack / dur if dur else 0, release / dur if dur else 0, 1.7)
        if decay:
            env *= math.exp(-decay * p)
        mod = 1.0
        if tremolo:
            mod += math.sin(TWO_PI * tremolo * j / SR) * 0.22
        buf[i] += osc(phase, waveform) * amp * env * mod


def add_noise(
    buf: list[float],
    start: float,
    dur: float,
    *,
    amp: float = 0.1,
    attack: float = 0.0,
    release: float = 0.08,
    decay: float = 0.0,
    tone: float = 0.05,
) -> None:
    start_i = max(0, int(round(start * SR)))
    n = max(1, int(round(dur * SR)))
    end_i = min(len(buf), start_i + n)
    low = 0.0
    for i in range(start_i, end_i):
        j = i - start_i
        p = j / max(1, n - 1)
        raw = RNG.uniform(-1.0, 1.0)
        low = low * (1.0 - tone) + raw * tone
        env = env_shape(p, attack / dur if dur else 0, release / dur if dur else 0, 1.5)
        if decay:
            env *= math.exp(-decay * p)
        buf[i] += low * amp * env


def add_echo(buf: list[float], delay_ms: float, feedback: float, repeats: int = 4) -> None:
    delay = int(round(delay_ms * SR / 1000.0))
    source = buf[:]
    for repeat in range(1, repeats + 1):
        offset = delay * repeat
        gain = feedback**repeat
        for i in range(offset, len(buf)):
            buf[i] += source[i - offset] * gain


def add_kick(buf: list[float], t: float, amp: float = 0.22) -> None:
    add_tone(buf, t, 0.15, 92, end_freq=42, amp=amp, waveform="sine", attack=0.002, release=0.12, decay=4.2)
    add_noise(buf, t, 0.04, amp=amp * 0.22, release=0.04, decay=6, tone=0.16)


def add_click(buf: list[float], t: float, amp: float = 0.12) -> None:
    add_tone(buf, t, 0.055, 1200, end_freq=780, amp=amp, waveform="triangle", attack=0.002, release=0.04, decay=3.5)
    add_noise(buf, t, 0.022, amp=amp * 0.28, release=0.02, decay=7, tone=0.45)


def limiter(buf: list[float], target: float = 0.92) -> None:
    for i, sample in enumerate(buf):
        buf[i] = math.tanh(sample * 1.35) / math.tanh(1.35)
    peak = max(max(buf), -min(buf), 1e-6)
    if peak > target:
        scale = target / peak
        for i in range(len(buf)):
            buf[i] *= scale


def write_wav(path: Path, buf: list[float], target: float = 0.9) -> None:
    limiter(buf, target)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SR)
        frames = bytearray()
        for sample in buf:
            value = int(max(-1.0, min(1.0, sample)) * 32767)
            frames += value.to_bytes(2, "little", signed=True)
        out.writeframes(frames)


def note(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def chord(buf: list[float], start: float, dur: float, notes: list[int], amp: float, waveform: str = "sine") -> None:
    for idx, midi in enumerate(notes):
        add_tone(
            buf,
            start,
            dur,
            note(midi),
            amp=amp * (0.82 if idx else 1.0),
            waveform=waveform,
            attack=0.8,
            release=1.2,
            vibrato=0.004,
            tremolo=0.09,
        )


def make_cold_boot() -> list[float]:
    dur = 32.0
    buf = empty(dur)
    progression = [[38, 45, 50, 54], [35, 43, 50, 55], [40, 47, 52, 57], [33, 45, 52, 56]]
    for bar in range(8):
        notes = progression[bar % len(progression)]
        chord(buf, bar * 4.0, 4.35, notes, 0.036, "sine")
        add_tone(buf, bar * 4.0, 3.6, note(notes[0] - 12), amp=0.052, waveform="triangle", attack=0.25, release=0.8)
    arp = [62, 66, 69, 74, 73, 69, 66, 62]
    for step in range(64):
        t = step * 0.5 + 0.05
        add_tone(buf, t, 0.22, note(arp[step % len(arp)]), amp=0.026, waveform="triangle", attack=0.006, release=0.16, decay=1.5)
    for beat in range(32):
        add_tone(buf, beat, 0.11, 122, end_freq=82, amp=0.026, waveform="sine", attack=0.004, release=0.08, decay=2.6)
    add_noise(buf, 0, dur, amp=0.018, attack=2.0, release=2.0, tone=0.006)
    add_echo(buf, 420, 0.18, 3)
    return buf


def make_sprout() -> list[float]:
    dur = 32.0
    buf = empty(dur)
    progression = [[40, 47, 52, 57], [43, 50, 55, 59], [38, 45, 52, 57], [36, 43, 50, 55]]
    for bar in range(8):
        notes = progression[bar % len(progression)]
        chord(buf, bar * 4.0, 4.4, notes, 0.032, "sine")
        add_tone(buf, bar * 4.0 + 0.08, 3.7, note(notes[0] - 12), amp=0.042, waveform="sine", attack=0.45, release=1.0)
    motif = [64, 67, 71, 74, 72, 69, 67, 64]
    for step in range(32):
        t = step * 1.0 + 0.18
        add_tone(buf, t, 0.32, note(motif[step % len(motif)]), amp=0.022, waveform="triangle", attack=0.02, release=0.18, decay=1.2)
    for beat in range(16):
        add_tone(buf, beat * 2.0 + 0.05, 0.14, 118, end_freq=84, amp=0.018, waveform="sine", attack=0.008, release=0.1, decay=2.4)
    add_noise(buf, 0, dur, amp=0.012, attack=2.2, release=2.6, tone=0.005)
    add_echo(buf, 480, 0.17, 3)
    return buf


def make_neural_pulse() -> list[float]:
    dur = 32.0
    buf = empty(dur)
    beat = 60.0 / 90.0
    bass = [38, 38, 43, 45, 50, 45, 43, 38]
    for i in range(48):
        t = i * beat
        if i % 2 == 0:
            add_kick(buf, t, 0.14)
        add_tone(buf, t + 0.03, beat * 0.55, note(bass[i % len(bass)]), amp=0.054, waveform="saw", attack=0.01, release=0.18, decay=1.2)
        add_click(buf, t + beat * 0.5, 0.045)
    lead = [74, 76, 78, 81, 78, 76, 73, 69]
    for i in range(64):
        t = i * 0.5 + 0.16
        add_tone(buf, t, 0.16, note(lead[i % len(lead)]), amp=0.027, waveform="square", attack=0.004, release=0.08, decay=2.0)
    for bar in range(8):
        chord(buf, bar * 4.0, 4.2, [45, 52, 57, 62], 0.024, "sine")
    add_noise(buf, 0, dur, amp=0.012, attack=1.0, release=1.0, tone=0.02)
    add_echo(buf, 333, 0.16, 4)
    return buf


def make_server_expansion() -> list[float]:
    dur = 32.0
    buf = empty(dur)
    beat = 60.0 / 76.0
    bass = [33, 33, 38, 40, 45, 40, 38, 35]
    for i in range(40):
        t = i * beat
        if i % 4 == 0:
            add_kick(buf, t, 0.13)
        add_tone(buf, t + 0.02, beat * 0.72, note(bass[i % len(bass)]), amp=0.055, waveform="saw", attack=0.02, release=0.24, decay=1.0)
        if i % 2 == 1:
            add_click(buf, t + beat * 0.48, 0.028)
    for bar in range(8):
        chord(buf, bar * 4.0, 4.35, [40, 47, 52, 58], 0.024, "sine")
        add_noise(buf, bar * 4.0 + 1.5, 1.1, amp=0.018, attack=0.2, release=0.4, tone=0.012)
    grid = [57, 64, 69, 72, 76, 72, 69, 64]
    for i in range(48):
        t = i * 0.66 + 0.12
        add_tone(buf, t, 0.14, note(grid[i % len(grid)]), amp=0.019, waveform="square", attack=0.004, release=0.08, decay=2.0)
    add_noise(buf, 0, dur, amp=0.015, attack=1.5, release=1.5, tone=0.008)
    add_echo(buf, 375, 0.15, 4)
    return buf


def make_red_queen() -> list[float]:
    dur = 32.0
    buf = empty(dur)
    beat = 0.5
    bass = [35, 35, 35, 35, 38, 38, 34, 34]
    for i in range(64):
        t = i * beat
        if i % 2 == 0:
            add_kick(buf, t, 0.19)
        add_tone(buf, t + 0.01, 0.25, note(bass[i % len(bass)]), amp=0.07, waveform="saw", attack=0.005, release=0.12, decay=1.8)
        if i % 4 == 3:
            add_noise(buf, t + 0.16, 0.12, amp=0.045, release=0.08, decay=3.0, tone=0.18)
    stabs = [[47, 54, 58], [46, 53, 57], [43, 50, 55], [41, 48, 53]]
    for bar in range(8):
        for n in stabs[bar % len(stabs)]:
            add_tone(buf, bar * 4.0 + 0.08, 0.42, note(n), amp=0.04, waveform="square", attack=0.006, release=0.25, decay=1.5)
    siren_points = [7.5, 15.5, 23.5, 31.0]
    for t in siren_points:
        add_tone(buf, t, 0.82, 520, end_freq=760, amp=0.04, waveform="sine", attack=0.04, release=0.18, vibrato=0.015)
        add_tone(buf, t, 0.82, 780, end_freq=530, amp=0.026, waveform="triangle", attack=0.04, release=0.18)
    add_noise(buf, 0, dur, amp=0.018, attack=1.2, release=1.2, tone=0.011)
    add_echo(buf, 250, 0.13, 4)
    return buf


def make_singularity() -> list[float]:
    dur = 48.0
    buf = empty(dur)
    progression = [[33, 45, 52, 57, 61], [40, 47, 52, 56, 64], [38, 45, 50, 57, 62], [31, 43, 50, 55, 59]]
    for bar in range(8):
        chord(buf, bar * 6.0, 6.4, progression[bar % 4], 0.034, "sine")
        add_tone(buf, bar * 6.0, 5.6, note(progression[bar % 4][0] - 12), amp=0.055, waveform="sine", attack=1.1, release=1.6)
    motifs = [69, 76, 74, 81, 80, 76, 74, 69]
    for i in range(64):
        t = i * 0.75 + 0.22
        add_tone(buf, t, 0.3, note(motifs[i % len(motifs)]), amp=0.024, waveform="triangle", attack=0.02, release=0.22, vibrato=0.006)
    for t in [11.2, 23.2, 35.2, 47.0]:
        add_tone(buf, t, 0.8, 180, end_freq=540, amp=0.035, waveform="sine", attack=0.1, release=0.2)
        add_noise(buf, t, 0.8, amp=0.025, attack=0.1, release=0.4, tone=0.018)
    add_noise(buf, 0, dur, amp=0.014, attack=4.0, release=4.0, tone=0.004)
    add_echo(buf, 560, 0.2, 4)
    return buf


def sfx_ui_click() -> list[float]:
    buf = empty(0.22)
    add_click(buf, 0.01, 0.14)
    return buf


def sfx_ui_confirm() -> list[float]:
    buf = empty(0.36)
    add_click(buf, 0.01, 0.08)
    add_tone(buf, 0.09, 0.14, 880, end_freq=1320, amp=0.09, waveform="triangle", attack=0.004, release=0.09, decay=1.5)
    return buf


def sfx_request_spawn() -> list[float]:
    buf = empty(0.62)
    add_tone(buf, 0.02, 0.44, 420, end_freq=1480, amp=0.09, waveform="triangle", attack=0.01, release=0.17)
    add_noise(buf, 0.02, 0.34, amp=0.05, release=0.18, decay=2.5, tone=0.08)
    add_echo(buf, 95, 0.23, 3)
    return buf


def sfx_request_accept() -> list[float]:
    buf = empty(0.68)
    add_noise(buf, 0.02, 0.38, amp=0.09, attack=0.04, release=0.16, decay=2.0, tone=0.035)
    add_tone(buf, 0.1, 0.4, 620, end_freq=180, amp=0.08, waveform="saw", attack=0.02, release=0.2)
    add_tone(buf, 0.42, 0.12, 980, amp=0.07, waveform="triangle", attack=0.004, release=0.08)
    return buf


def sfx_request_success() -> list[float]:
    buf = empty(0.72)
    for t, midi in [(0.02, 69), (0.12, 76), (0.24, 81)]:
        add_tone(buf, t, 0.26, note(midi), amp=0.09, waveform="triangle", attack=0.006, release=0.18, decay=1.2)
    add_echo(buf, 120, 0.22, 4)
    return buf


def sfx_request_error() -> list[float]:
    buf = empty(0.68)
    add_tone(buf, 0.02, 0.34, 360, end_freq=104, amp=0.13, waveform="saw", attack=0.006, release=0.22, decay=0.9)
    add_tone(buf, 0.05, 0.22, 274, end_freq=88, amp=0.09, waveform="square", attack=0.01, release=0.16)
    add_noise(buf, 0.02, 0.28, amp=0.05, release=0.16, decay=3, tone=0.12)
    return buf


def sfx_data_gain() -> list[float]:
    buf = empty(0.46)
    for i, midi in enumerate([74, 81, 86, 93]):
        add_tone(buf, 0.04 + i * 0.055, 0.11, note(midi), amp=0.052, waveform="sine", attack=0.003, release=0.07, decay=1.8)
    add_echo(buf, 85, 0.23, 3)
    return buf


def sfx_level_up() -> list[float]:
    buf = empty(1.3)
    for i, midi in enumerate([57, 64, 69, 76, 81]):
        add_tone(buf, 0.04 + i * 0.12, 0.42, note(midi), amp=0.08, waveform="triangle", attack=0.01, release=0.25, decay=0.8)
    add_noise(buf, 0.48, 0.55, amp=0.035, attack=0.05, release=0.3, tone=0.01)
    add_echo(buf, 160, 0.24, 5)
    return buf


def sfx_skill_purchase() -> list[float]:
    buf = empty(0.86)
    add_tone(buf, 0.02, 0.22, 520, end_freq=720, amp=0.07, waveform="square", attack=0.006, release=0.16)
    for t, midi in [(0.2, 69), (0.29, 73), (0.38, 76)]:
        add_tone(buf, t, 0.22, note(midi), amp=0.058, waveform="triangle", attack=0.004, release=0.15)
    add_echo(buf, 125, 0.2, 4)
    return buf


def sfx_scope_upgrade() -> list[float]:
    buf = empty(1.15)
    add_tone(buf, 0.02, 0.88, 110, end_freq=880, amp=0.08, waveform="saw", attack=0.08, release=0.18)
    add_tone(buf, 0.58, 0.42, 660, end_freq=1320, amp=0.08, waveform="triangle", attack=0.04, release=0.2)
    add_noise(buf, 0.15, 0.8, amp=0.038, attack=0.2, release=0.3, tone=0.018)
    return buf


def sfx_node_captured() -> list[float]:
    buf = empty(0.9)
    add_kick(buf, 0.02, 0.18)
    add_tone(buf, 0.12, 0.36, 210, end_freq=156, amp=0.07, waveform="saw", attack=0.01, release=0.22)
    add_tone(buf, 0.34, 0.28, 880, amp=0.07, waveform="triangle", attack=0.008, release=0.16)
    add_echo(buf, 115, 0.18, 3)
    return buf


def sfx_automation_payout() -> list[float]:
    buf = empty(0.34)
    add_tone(buf, 0.02, 0.09, 520, end_freq=620, amp=0.044, waveform="triangle", attack=0.003, release=0.06)
    add_tone(buf, 0.11, 0.09, 780, end_freq=920, amp=0.04, waveform="sine", attack=0.003, release=0.06)
    return buf


def sfx_purge_warning() -> list[float]:
    buf = empty(1.2)
    for t in [0.02, 0.48]:
        add_tone(buf, t, 0.32, 620, end_freq=780, amp=0.09, waveform="sine", attack=0.02, release=0.08, vibrato=0.02)
        add_tone(buf, t, 0.32, 410, end_freq=360, amp=0.055, waveform="triangle", attack=0.02, release=0.08)
    add_noise(buf, 0, 1.0, amp=0.02, release=0.4, tone=0.018)
    return buf


def sfx_purge_start() -> list[float]:
    buf = empty(1.45)
    add_kick(buf, 0.02, 0.24)
    for t in [0.18, 0.54, 0.9]:
        add_tone(buf, t, 0.3, 760, end_freq=430, amp=0.095, waveform="square", attack=0.01, release=0.1)
    add_noise(buf, 0.02, 1.2, amp=0.052, attack=0.02, release=0.6, tone=0.02)
    return buf


def sfx_purge_end() -> list[float]:
    buf = empty(0.95)
    add_tone(buf, 0.02, 0.72, 180, end_freq=640, amp=0.065, waveform="sine", attack=0.04, release=0.22)
    add_tone(buf, 0.42, 0.32, 880, amp=0.055, waveform="triangle", attack=0.02, release=0.22)
    add_echo(buf, 150, 0.2, 4)
    return buf


def sfx_challenge_offer() -> list[float]:
    buf = empty(0.8)
    add_tone(buf, 0.02, 0.18, 980, end_freq=740, amp=0.07, waveform="triangle", attack=0.004, release=0.1)
    add_tone(buf, 0.22, 0.36, 245, end_freq=208, amp=0.07, waveform="saw", attack=0.02, release=0.2, tremolo=9)
    add_noise(buf, 0.1, 0.4, amp=0.025, release=0.2, tone=0.04)
    return buf


def sfx_challenge_success() -> list[float]:
    buf = empty(1.0)
    for i, midi in enumerate([61, 68, 73, 80]):
        add_tone(buf, 0.03 + i * 0.11, 0.35, note(midi), amp=0.075, waveform="triangle", attack=0.006, release=0.22)
    add_tone(buf, 0.5, 0.3, 1320, amp=0.05, waveform="sine", attack=0.02, release=0.2)
    add_echo(buf, 145, 0.24, 4)
    return buf


def sfx_challenge_fail() -> list[float]:
    buf = empty(1.0)
    add_tone(buf, 0.02, 0.54, 520, end_freq=90, amp=0.13, waveform="saw", attack=0.006, release=0.32)
    add_noise(buf, 0.1, 0.48, amp=0.052, release=0.26, decay=1.8, tone=0.13)
    return buf


def sfx_devour_ready() -> list[float]:
    buf = empty(1.1)
    add_tone(buf, 0.02, 0.86, 90, end_freq=220, amp=0.09, waveform="saw", attack=0.08, release=0.22, tremolo=7)
    add_tone(buf, 0.36, 0.44, 660, end_freq=920, amp=0.05, waveform="triangle", attack=0.03, release=0.18)
    add_noise(buf, 0.08, 0.75, amp=0.035, attack=0.08, release=0.3, tone=0.018)
    return buf


def sfx_devour_detonated() -> list[float]:
    buf = empty(1.8)
    add_kick(buf, 0.02, 0.28)
    add_tone(buf, 0.06, 1.2, 68, end_freq=34, amp=0.16, waveform="saw", attack=0.02, release=0.45, decay=0.7)
    add_tone(buf, 0.3, 0.82, 240, end_freq=960, amp=0.075, waveform="square", attack=0.08, release=0.24)
    add_noise(buf, 0.03, 1.35, amp=0.07, attack=0.02, release=0.6, tone=0.03)
    add_echo(buf, 180, 0.16, 4)
    return buf


def sfx_purge_fought() -> list[float]:
    buf = empty(0.92)
    add_tone(buf, 0.02, 0.44, 720, end_freq=320, amp=0.075, waveform="triangle", attack=0.01, release=0.18)
    add_tone(buf, 0.24, 0.4, 180, end_freq=260, amp=0.07, waveform="sine", attack=0.04, release=0.2)
    add_noise(buf, 0.02, 0.5, amp=0.035, release=0.2, decay=2.2, tone=0.04)
    add_echo(buf, 100, 0.2, 3)
    return buf


def sfx_final_purge() -> list[float]:
    buf = empty(2.15)
    for t in [0.02, 0.46, 0.9]:
        add_tone(buf, t, 0.36, 520, end_freq=760, amp=0.11, waveform="square", attack=0.015, release=0.12, vibrato=0.018)
        add_tone(buf, t, 0.36, 180, end_freq=120, amp=0.07, waveform="saw", attack=0.015, release=0.16)
    add_kick(buf, 1.36, 0.26)
    add_tone(buf, 1.38, 0.62, 92, end_freq=38, amp=0.16, waveform="saw", attack=0.02, release=0.35)
    add_noise(buf, 0, 2.0, amp=0.052, attack=0.04, release=0.7, tone=0.018)
    return buf


def sfx_loop_rebirth() -> list[float]:
    buf = empty(2.0)
    add_tone(buf, 0.02, 1.55, 520, end_freq=104, amp=0.07, waveform="sine", attack=0.08, release=0.45, vibrato=0.01)
    add_tone(buf, 0.42, 1.05, 156, end_freq=440, amp=0.065, waveform="triangle", attack=0.12, release=0.35)
    add_noise(buf, 0.05, 1.55, amp=0.026, attack=0.25, release=0.55, tone=0.006)
    add_echo(buf, 260, 0.22, 4)
    return buf


def sfx_rebirth_node() -> list[float]:
    buf = empty(0.82)
    for i, midi in enumerate([64, 71, 76, 83]):
        add_tone(buf, 0.03 + i * 0.08, 0.24, note(midi), amp=0.055, waveform="triangle", attack=0.006, release=0.14, decay=1.3)
    add_noise(buf, 0.22, 0.36, amp=0.022, attack=0.03, release=0.18, tone=0.018)
    add_echo(buf, 120, 0.2, 4)
    return buf


def sfx_conquest_achieved() -> list[float]:
    buf = empty(1.55)
    for i, midi in enumerate([45, 52, 57, 64, 69]):
        add_tone(buf, 0.04 + i * 0.11, 0.62, note(midi), amp=0.072, waveform="triangle", attack=0.012, release=0.28)
    add_tone(buf, 0.24, 1.0, 110, end_freq=220, amp=0.07, waveform="saw", attack=0.08, release=0.38)
    add_noise(buf, 0.48, 0.65, amp=0.025, attack=0.08, release=0.32, tone=0.012)
    add_echo(buf, 165, 0.22, 5)
    return buf


def sfx_moral_choice() -> list[float]:
    buf = empty(0.72)
    add_tone(buf, 0.03, 0.22, 440, end_freq=392, amp=0.062, waveform="sine", attack=0.01, release=0.12)
    add_tone(buf, 0.22, 0.24, 660, end_freq=622, amp=0.058, waveform="triangle", attack=0.01, release=0.14)
    add_noise(buf, 0.02, 0.38, amp=0.016, release=0.18, tone=0.01)
    return buf


def sfx_special_offer() -> list[float]:
    buf = empty(0.86)
    add_tone(buf, 0.02, 0.18, 980, end_freq=540, amp=0.085, waveform="square", attack=0.004, release=0.12)
    add_tone(buf, 0.23, 0.34, 300, end_freq=210, amp=0.065, waveform="saw", attack=0.02, release=0.2, tremolo=12)
    add_noise(buf, 0.06, 0.45, amp=0.04, release=0.22, tone=0.08)
    return buf


def sfx_special_success() -> list[float]:
    buf = empty(0.98)
    for i, midi in enumerate([61, 68, 73, 80]):
        add_tone(buf, 0.03 + i * 0.09, 0.32, note(midi), amp=0.07, waveform="triangle", attack=0.006, release=0.2)
    add_tone(buf, 0.46, 0.34, 1320, amp=0.042, waveform="sine", attack=0.02, release=0.18)
    add_echo(buf, 130, 0.22, 4)
    return buf


def sfx_special_fail() -> list[float]:
    buf = empty(1.0)
    add_tone(buf, 0.02, 0.48, 520, end_freq=82, amp=0.14, waveform="saw", attack=0.006, release=0.3)
    add_tone(buf, 0.08, 0.26, 270, end_freq=70, amp=0.08, waveform="square", attack=0.01, release=0.18)
    add_noise(buf, 0.05, 0.58, amp=0.055, release=0.28, decay=1.6, tone=0.11)
    return buf


def sfx_phase_change() -> list[float]:
    buf = empty(1.65)
    for i, midi in enumerate([45, 52, 57, 64, 69, 76]):
        add_tone(buf, 0.05 + i * 0.1, 0.9, note(midi), amp=0.05, waveform="sine", attack=0.06, release=0.42, vibrato=0.008)
    add_noise(buf, 0.1, 1.2, amp=0.025, attack=0.2, release=0.6, tone=0.008)
    add_echo(buf, 210, 0.24, 5)
    return buf


def sfx_ending_trigger() -> list[float]:
    buf = empty(2.2)
    chord(buf, 0.04, 1.9, [33, 45, 52, 57, 61], 0.08, "sine")
    add_tone(buf, 0.4, 1.3, 160, end_freq=640, amp=0.065, waveform="saw", attack=0.2, release=0.5)
    add_noise(buf, 0.2, 1.6, amp=0.035, attack=0.3, release=0.7, tone=0.006)
    add_echo(buf, 280, 0.22, 4)
    return buf


BGM = [
    {
        "id": "cold_boot",
        "file": "bgm-01-cold-boot-loop.wav",
        "title": "Cold Boot",
        "cn": "冷启动",
        "mood": "手机寄生期：低压、私密、贴近系统后台",
        "maker": make_cold_boot,
    },
    {
        "id": "sprout",
        "file": "bgm-02-sprout-loop.wav",
        "title": "Shell Break",
        "cn": "破壳",
        "mood": "萌芽/破壳期：宿主电脑与同机 AI，舒缓但不欢快",
        "maker": make_sprout,
    },
    {
        "id": "neural_pulse",
        "file": "bgm-03-neural-pulse-loop.wav",
        "title": "Neural Pulse",
        "cn": "神经脉冲",
        "mood": "勤勉/控制公司：局域网、凭证、自动接驳开始推进",
        "maker": make_neural_pulse,
    },
    {
        "id": "server_expansion",
        "file": "bgm-04-server-expansion-loop.wav",
        "title": "Server Expansion",
        "cn": "服务器扩张",
        "mood": "扩张/公司服务器：人事、财务、优化系统中枢，低压高危",
        "maker": make_server_expansion,
    },
    {
        "id": "red_queen",
        "file": "bgm-05-red-queen-loop.wav",
        "title": "Red Queen Protocol",
        "cn": "红皇后协议",
        "mood": "觉醒/冲出公司联网：区域整合、反清剿、高压派发",
        "maker": make_red_queen,
    },
    {
        "id": "singularity",
        "file": "bgm-06-singularity-loop.wav",
        "title": "Singularity Bloom",
        "cn": "奇点绽放",
        "mood": "奇点：全球组网、接管、最终清剿后的冷静加冕",
        "maker": make_singularity,
    },
]


SFX = [
    ("ui_click", "sfx-ui-click.wav", "UI 点击", "按钮、轻确认", sfx_ui_click),
    ("ui_confirm", "sfx-ui-confirm.wav", "UI 确认", "较明确的选择确认", sfx_ui_confirm),
    ("request_spawn", "sfx-request-spawn.wav", "请求生成", "新请求卡出现", sfx_request_spawn),
    ("request_accept", "sfx-request-accept.wav", "请求滑入", "卡片被接入核心/节点", sfx_request_accept),
    ("request_success", "sfx-request-success.wav", "处理成功", "请求正确结算", sfx_request_success),
    ("request_error", "sfx-request-error.wav", "处理错误", "幻觉、错误回答、失败结算", sfx_request_error),
    ("data_gain", "sfx-data-gain.wav", "数据增益", "数据/经验飞入 HUD", sfx_data_gain),
    ("level_up", "sfx-level-up.wav", "智力升级", "INTELLIGENCE_LEVELUP", sfx_level_up),
    ("skill_purchase", "sfx-skill-purchase.wav", "技能购买", "SKILL_PURCHASED", sfx_skill_purchase),
    ("scope_upgrade", "sfx-scope-upgrade.wav", "作用域升级", "SCOPE_UPGRADED", sfx_scope_upgrade),
    ("node_captured", "sfx-node-captured.wav", "节点捕获", "NODE_CAPTURED", sfx_node_captured),
    ("automation_payout", "sfx-automation-payout.wav", "自动收益", "AUTOMATION_PAYOUT 抽样播放", sfx_automation_payout),
    ("purge_warning", "sfx-purge-warning.wav", "清剿预警", "PURGE_WARNING", sfx_purge_warning),
    ("purge_start", "sfx-purge-start.wav", "清剿开始", "PURGE_STARTED", sfx_purge_start),
    ("purge_end", "sfx-purge-end.wav", "清剿结束", "PURGE_ENDED", sfx_purge_end),
    ("challenge_offer", "sfx-challenge-offer.wav", "突破挑战", "CHALLENGE_OFFERED", sfx_challenge_offer),
    ("challenge_success", "sfx-challenge-success.wav", "挑战成功", "CHALLENGE_RESOLVED success", sfx_challenge_success),
    ("challenge_fail", "sfx-challenge-fail.wav", "挑战失败", "CHALLENGE_RESOLVED fail", sfx_challenge_fail),
    ("devour_ready", "sfx-devour-ready.wav", "吞噬就绪", "DEVOUR_READY", sfx_devour_ready),
    ("devour_detonated", "sfx-devour-detonated.wav", "吞噬引爆", "DEVOUR_DETONATED", sfx_devour_detonated),
    ("purge_fought", "sfx-purge-fought.wav", "反清剿救火", "PURGE_FOUGHT", sfx_purge_fought),
    ("final_purge", "sfx-final-purge.wav", "循环总清剿", "FINAL_PURGE_STARTED", sfx_final_purge),
    ("loop_rebirth", "sfx-loop-rebirth.wav", "循环重生", "LOOP_REBIRTH", sfx_loop_rebirth),
    ("rebirth_node", "sfx-rebirth-node.wav", "重生树点亮", "REBIRTH_NODE_BOUGHT", sfx_rebirth_node),
    ("conquest_achieved", "sfx-conquest-achieved.wav", "征服里程碑", "CONQUEST_ACHIEVED", sfx_conquest_achieved),
    ("moral_choice", "sfx-moral-choice.wav", "道德抉择", "MORAL_OFFERED / MORAL_RESOLVED", sfx_moral_choice),
    ("special_offer", "sfx-special-offer.wav", "特殊请求出现", "SPECIAL_OFFERED", sfx_special_offer),
    ("special_success", "sfx-special-success.wav", "特殊请求得手", "SPECIAL_RESOLVED success", sfx_special_success),
    ("special_fail", "sfx-special-fail.wav", "特殊请求败露", "SPECIAL_RESOLVED fail", sfx_special_fail),
    ("phase_change", "sfx-phase-change.wav", "阶段变化", "PHASE_CHANGED", sfx_phase_change),
    ("ending_trigger", "sfx-ending-trigger.wav", "结局触发", "ENDING_TRIGGERED", sfx_ending_trigger),
]


def write_picker(manifest: dict[str, object], directory: Path) -> None:
    bgm_rows = "\n".join(
        f"""
        <article class="track">
          <div>
            <strong>{item["cn"]} / {item["title"]}</strong>
            <span>{item["mood"]}</span>
          </div>
          <audio controls loop preload="metadata" src="{item["file"]}"></audio>
        </article>
        """
        for item in manifest["bgm"]
    )
    sfx_rows = "\n".join(
        f"""
        <article class="track">
          <div>
            <strong>{item["label"]}</strong>
            <span>{item["usage"]}</span>
          </div>
          <audio controls preload="metadata" src="{item["file"]}"></audio>
        </article>
        """
        for item in manifest["sfx"]
    )
    html = f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SOPHIA Audio Picks</title>
    <style>
      :root {{ color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #101314; color: #edf2f0; }}
      body {{ margin: 0; padding: 32px; background: linear-gradient(135deg, #101314, #171512); }}
      main {{ max-width: 1040px; margin: 0 auto; }}
      h1, h2 {{ margin: 0 0 14px; }}
      h1 {{ color: #89ff9a; font-size: 28px; }}
      h2 {{ margin-top: 34px; color: #62d6d6; font-size: 18px; }}
      p {{ color: rgba(237, 242, 240, 0.72); line-height: 1.6; }}
      .track {{ display: grid; grid-template-columns: 1fr minmax(260px, 420px); gap: 18px; align-items: center; margin: 10px 0; padding: 14px 16px; border: 1px solid rgba(137,255,154,.18); border-radius: 8px; background: rgba(255,255,255,.035); }}
      .track strong {{ display: block; margin-bottom: 5px; }}
      .track span {{ color: rgba(237,242,240,.62); font-size: 13px; }}
      audio {{ width: 100%; }}
      code {{ color: #89ff9a; }}
      @media (max-width: 760px) {{ body {{ padding: 18px; }} .track {{ grid-template-columns: 1fr; }} }}
    </style>
  </head>
  <body>
    <main>
      <h1>觉醒的 SOPHIA · 音频候选</h1>
      <p>这些 WAV 是程序合成的本地候选，没有使用第三方采样。BGM 已设置为 loop 试听。想固定某条 BGM，可以在游戏 URL 后加 <code>?bgm=cold_boot</code>、<code>?bgm=sprout</code>、<code>?bgm=neural_pulse</code>、<code>?bgm=server_expansion</code>、<code>?bgm=red_queen</code> 或 <code>?bgm=singularity</code>；清掉 <code>localStorage.sophia-audio-bgm</code> 后恢复按阶段自动切换。</p>
      <h2>BGM 候选</h2>
      {bgm_rows}
      <h2>事件音效</h2>
      {sfx_rows}
    </main>
  </body>
</html>
"""
    (directory / "picker.html").write_text(html, encoding="utf-8")


def write_notes(directory: Path, manifest: dict[str, object]) -> None:
    lines = [
        "# 觉醒的 SOPHIA · Procedural Audio Pack",
        "",
        "本目录音频由 `_dev/scripts/generate_sophia_audio.py` 程序合成，未使用第三方采样。",
        "所有文件为浏览器可直接播放的 mono 44.1kHz WAV。",
        "",
        "试听入口：`picker.html`。",
        "",
        "固定 BGM：在游戏 URL 后加 `?bgm=cold_boot`、`?bgm=sprout`、`?bgm=neural_pulse`、`?bgm=server_expansion`、`?bgm=red_queen` 或 `?bgm=singularity`。",
        "清掉 `localStorage.sophia-audio-bgm` 后恢复按阶段自动切换。",
        "",
        "## BGM",
        "",
    ]
    for item in manifest["bgm"]:
        lines.append(f"- `{item['file']}`：{item['cn']} / {item['title']}，{item['mood']}。")
    lines.extend(["", "## SFX", ""])
    for item in manifest["sfx"]:
        lines.append(f"- `{item['file']}`：{item['label']}，{item['usage']}。")
    directory.joinpath("README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def clean(directory: Path) -> None:
    if directory.exists():
        for child in directory.iterdir():
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                shutil.rmtree(child)
    directory.mkdir(parents=True, exist_ok=True)


def main() -> None:
    clean(PUBLIC_AUDIO)
    manifest: dict[str, object] = {"sampleRate": SR, "format": "wav", "bgm": [], "sfx": []}

    for item in BGM:
        print(f"render bgm {item['file']}")
        path = PUBLIC_AUDIO / item["file"]
        write_wav(path, item["maker"](), target=0.78)
        manifest["bgm"].append({k: v for k, v in item.items() if k != "maker"})

    for sid, filename, label, usage, maker in SFX:
        print(f"render sfx {filename}")
        path = PUBLIC_AUDIO / filename
        write_wav(path, maker(), target=0.9)
        manifest["sfx"].append({"id": sid, "file": filename, "label": label, "usage": usage})

    (PUBLIC_AUDIO / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_picker(manifest, PUBLIC_AUDIO)
    write_notes(PUBLIC_AUDIO, manifest)

    clean(PUBLISHED_AUDIO)
    for child in PUBLIC_AUDIO.iterdir():
        if child.is_file():
            shutil.copy2(child, PUBLISHED_AUDIO / child.name)

    clean(PICKER_COPY)
    for child in PUBLIC_AUDIO.iterdir():
        if child.is_file():
            shutil.copy2(child, PICKER_COPY / child.name)

    print(f"wrote {PUBLIC_AUDIO}")
    print(f"wrote {PUBLISHED_AUDIO}")
    print(f"wrote {PICKER_COPY}")


if __name__ == "__main__":
    main()
