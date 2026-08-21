"""Bake the Chuchuan prologue's fixed cast with local Qwen3-TTS.

Seed Audio remains the preferred route in Script_VoiceBake.mjs.  This script is its
offline fallback: it designs one synthetic reference for each role and clones that
fixed reference for every one of the role's lines.  It never uses a real person's
voice recording.
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


ProjectDir = Path(__file__).resolve().parent
CastPath = ProjectDir / "Data_PrologueVoiceQwen.json"
ManifestPath = ProjectDir / "Data_PrologueVoiceQwenManifest.json"
ReferenceDir = ProjectDir / "Audio" / "VoiceReference"
OutputDir = ProjectDir / "Audio"
TargetRmsDb = -16.1
PeakCeilDb = -1.0


def ParseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bake Taierzhuang1938 prologue voices with Qwen3-TTS")
    parser.add_argument("--force", action="store_true", help="regenerate references and lines")
    parser.add_argument("--key", action="append", default=[], help="only bake a cue key; repeatable")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    return parser.parse_args()


def ReadJson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def SetSeed(seed: int) -> None:
    np.random.seed(seed % (2 ** 32))
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def LoadModel(name: str, revision: str, device: str) -> Qwen3TTSModel:
    print(f"Loading {name}@{revision}")
    return Qwen3TTSModel.from_pretrained(
        name, revision=revision, device_map=device, dtype=torch.bfloat16, attn_implementation="sdpa"
    )


def ClearCuda() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def TrimWave(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    mono = np.asarray(wav, dtype=np.float32).reshape(-1)
    active = np.flatnonzero(np.abs(mono) >= math.pow(10.0, -48.0 / 20.0))
    if not len(active):
        raise RuntimeError("Qwen returned silence")
    head = round(sample_rate * 0.07)
    tail = round(sample_rate * 0.20)
    start = max(0, int(active[0]) - head)
    end = min(len(mono), int(active[-1]) + 1 + head)
    return np.pad(mono[start:end], (0, tail)).astype(np.float32, copy=False)


def GainDb(wav: np.ndarray) -> float:
    peak = float(np.max(np.abs(wav)))
    voiced = wav[np.abs(wav) >= peak * 0.1]
    rms = math.sqrt(float(np.mean(np.square(voiced)))) if len(voiced) else 0.0
    rms_db = 20.0 * math.log10(rms + 1e-9)
    peak_db = 20.0 * math.log10(peak + 1e-9)
    return min(TargetRmsDb - rms_db, PeakCeilDb - peak_db)


def Encode(wav: np.ndarray, sample_rate: int, wav_path: Path, mp3_path: Path, ffmpeg: str) -> float:
    sf.write(wav_path, wav, sample_rate, subtype="PCM_16")
    gain = GainDb(wav)
    command = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
        "-af", f"volume={gain:.2f}dB", "-ac", "1", "-ar", "24000",
        "-codec:a", "libmp3lame", "-b:a", "48k", str(mp3_path),
    ]
    subprocess.run(command, check=True)
    return round(len(wav) / sample_rate, 2)


def DesignReferences(cast: dict, roles: set[str], args: argparse.Namespace) -> None:
    ReferenceDir.mkdir(parents=True, exist_ok=True)
    pending = [role for role in sorted(roles) if args.force or not (ReferenceDir / cast["roles"][role]["referenceAsset"]).exists()]
    if not pending:
        print("Qwen role references already present")
        return
    model = LoadModel(cast["designModel"], cast["designRevision"], args.device)
    try:
        for role in pending:
            spec = cast["roles"][role]
            SetSeed(int(spec["seed"]))
            wavs, rate = model.generate_voice_design(
                text=spec["referenceText"], language=cast["language"], instruct=spec["instruction"]
            )
            path = ReferenceDir / spec["referenceAsset"]
            sf.write(path, np.asarray(wavs[0], dtype=np.float32), rate, format="FLAC", subtype="PCM_16")
            print(f"Designed {role}: {path.name}")
    finally:
        del model
        ClearCuda()


def BakeLines(cast: dict, lines: list[dict], args: argparse.Namespace) -> dict[str, float]:
    pending = [line for line in lines if args.force or not (OutputDir / line["file"]).exists()]
    if not pending:
        print("Qwen prologue files already present")
        return {}
    OutputDir.mkdir(parents=True, exist_ok=True)
    wav_dir = ProjectDir / "_VoiceQwenWork"
    wav_dir.mkdir(parents=True, exist_ok=True)
    model = LoadModel(cast["cloneModel"], cast["cloneRevision"], args.device)
    durations: dict[str, float] = {}
    try:
        for role in dict.fromkeys(line["voice"] for line in pending):
            spec = cast["roles"][role]
            reference = ReferenceDir / spec["referenceAsset"]
            prompt = model.create_voice_clone_prompt(ref_audio=str(reference), ref_text=spec["referenceText"])
            role_lines = [line for line in pending if line["voice"] == role]
            for offset, line in enumerate(role_lines):
                SetSeed(int(spec["seed"]) + 1000 + offset)
                wavs, rate = model.generate_voice_clone(
                    text=line["text"], language=cast["language"], voice_clone_prompt=prompt
                )
                trimmed = TrimWave(wavs[0], rate)
                wav_path = wav_dir / f"{line['key']}.wav"
                mp3_path = OutputDir / line["file"]
                durations[line["key"]] = Encode(trimmed, rate, wav_path, mp3_path, args.ffmpeg)
                print(f"Baked {role} {line['key']} {durations[line['key']]:.2f}s")
    finally:
        del model
        ClearCuda()
    return durations


def Main() -> None:
    args = ParseArgs()
    cast = ReadJson(CastPath)
    manifest = ReadJson(ManifestPath)
    keys = set(args.key)
    lines = [line for line in manifest["lines"] if not keys or line["key"] in keys]
    if keys - {line["key"] for line in lines}:
        raise RuntimeError("Unknown cue key: " + ", ".join(sorted(keys - {line["key"] for line in lines})))
    roles = {line["voice"] for line in lines}
    if roles - set(cast["roles"]):
        raise RuntimeError("Manifest references a missing Qwen role")
    DesignReferences(cast, roles, args)
    BakeLines(cast, lines, args)


if __name__ == "__main__":
    Main()
