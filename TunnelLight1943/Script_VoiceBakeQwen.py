"""Bake the complete voice cast with Qwen3-TTS.

The production path follows Qwen's documented Voice Design -> Voice Clone flow:
design one original synthetic reference per role, then reuse that fixed reference for
every line assigned to the role. No real person's voice or reference recording is used.

Example:
  python Script_VoiceBakeQwen.py --workDir C:\\Temp\\TunnelLightVoice
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


ProjectDir = Path(__file__).resolve().parent
DefaultManifest = ProjectDir / "Audio" / "Voice_Manifest.json"
DefaultCast = ProjectDir / "Data_VoiceCast.json"
DefaultOutputDir = ProjectDir / "Audio" / "Voice"
DefaultReferenceDir = ProjectDir / "Audio" / "VoiceReference"


def ParseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bake TunnelLight1943 Qwen3-TTS voices")
    parser.add_argument("--manifest", type=Path, default=DefaultManifest)
    parser.add_argument("--cast", type=Path, default=DefaultCast)
    parser.add_argument("--designModel")
    parser.add_argument("--designRevision")
    parser.add_argument("--cloneModel")
    parser.add_argument("--cloneRevision")
    parser.add_argument("--workDir", type=Path, required=True)
    parser.add_argument("--outputDir", type=Path, default=DefaultOutputDir)
    parser.add_argument("--referenceDir", type=Path, default=DefaultReferenceDir)
    parser.add_argument("--stage", choices=("design", "bake", "all"), default="all")
    parser.add_argument("--role", action="append", default=[])
    parser.add_argument("--lineId", action="append", default=[])
    parser.add_argument("--batchSize", type=int, default=1)
    parser.add_argument("--forceReference", action="store_true")
    parser.add_argument("--forceLines", action="store_true")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    return parser.parse_args()


def LoadJson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def WriteJson(path: Path, value: dict) -> None:
    tempPath = path.with_suffix(path.suffix + ".tmp")
    tempPath.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tempPath.replace(path)


def SetSeed(seed: int) -> None:
    np.random.seed(seed % (2**32))
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def LoadModel(modelName: str, modelRevision: str | None, device: str) -> Qwen3TTSModel:
    print(f"加载模型：{modelName}@{modelRevision or 'main'}")
    return Qwen3TTSModel.from_pretrained(
        modelName,
        revision=modelRevision,
        device_map=device,
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )


def ClearCuda() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def ReferencePath(referenceDir: Path, roleName: str, roleData: dict) -> Path:
    assetName = roleData.get("referenceAsset") or f"AudioVoiceRef_{roleName}_V1.flac"
    return referenceDir / assetName


def ValidateReference(referencePath: Path, roleData: dict) -> None:
    expectedHash = roleData.get("referenceSha256")
    if not expectedHash:
        return
    actualHash = hashlib.sha256(referencePath.read_bytes()).hexdigest().upper()
    if actualHash != expectedHash.upper():
        raise RuntimeError(
            f"参考声线哈希不一致：{referencePath.name}\n"
            f"期望 {expectedHash}\n实际 {actualHash}"
        )


def GenerateReferences(castData: dict, roleNames: list[str], referenceDir: Path,
                       device: str, forceReference: bool) -> None:
    referenceDir.mkdir(parents=True, exist_ok=True)
    pendingRoles = [
        roleName for roleName in roleNames
        if forceReference or not ReferencePath(
            referenceDir, roleName, castData["roles"][roleName]
        ).exists()
    ]
    if not pendingRoles:
        print("原创角色参考声线已齐全，跳过设计阶段")
        return

    designModel = LoadModel(
        castData["designModel"], castData.get("designRevision"), device
    )
    try:
        for roleName in pendingRoles:
            roleData = castData["roles"][roleName]
            SetSeed(int(roleData["seed"]))
            print(f"设计角色声线：{roleName}")
            wavs, sampleRate = designModel.generate_voice_design(
                text=roleData["referenceText"],
                # 角色可以带自己的语言（日军的日语原声就靠它），默认跟全局
                language=roleData.get("language", castData["language"]),
                instruct=roleData["instruction"],
            )
            sf.write(
                ReferencePath(referenceDir, roleName, roleData),
                np.asarray(wavs[0], dtype=np.float32),
                sampleRate,
                format="FLAC",
                subtype="PCM_16",
            )
    finally:
        del designModel
        ClearCuda()


def TrimWave(wav: np.ndarray, sampleRate: int) -> np.ndarray:
    monoWav = np.asarray(wav, dtype=np.float32).reshape(-1)
    if not len(monoWav):
        raise RuntimeError("模型返回了空音频")

    threshold = math.pow(10.0, -48.0 / 20.0)
    active = np.flatnonzero(np.abs(monoWav) >= threshold)
    if not len(active):
        raise RuntimeError("模型返回的音频全是静音")

    headPad = round(sampleRate * 0.07)
    tailPad = round(sampleRate * 0.20)
    start = max(0, int(active[0]) - headPad)
    end = min(len(monoWav), int(active[-1]) + 1 + headPad)
    trimmedWav = monoWav[start:end]
    return np.pad(trimmedWav, (0, tailPad)).astype(np.float32, copy=False)


def EncodeMp3(wavPath: Path, mp3Path: Path, ffmpegPath: str) -> None:
    command = [
        ffmpegPath, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wavPath),
        "-af", "loudnorm=I=-20:LRA=7:TP=-2",
        "-ac", "1", "-ar", "24000",
        "-codec:a", "libmp3lame", "-b:a", "48k",
        str(mp3Path),
    ]
    subprocess.run(command, check=True)


def SelectedLines(manifestData: dict, roleNames: set[str], lineIds: set[str]) -> list[dict]:
    selected = []
    for lineData in manifestData["lines"]:
        if roleNames and lineData["voice"] not in roleNames:
            continue
        if lineIds and lineData["id"] not in lineIds:
            continue
        selected.append(lineData)
    return selected


def BakeLines(castData: dict, manifestData: dict, selectedLines: list[dict],
              referenceDir: Path, workDir: Path, outputDir: Path, device: str,
              ffmpegPath: str, batchSize: int, forceLines: bool, preview: bool,
              manifestPath: Path) -> None:
    if batchSize < 1:
        raise ValueError("--batchSize 必须至少为 1")
    if not shutil.which(ffmpegPath) and not Path(ffmpegPath).exists():
        raise RuntimeError(f"找不到 ffmpeg：{ffmpegPath}")

    wavDir = workDir / "LineWav"
    wavDir.mkdir(parents=True, exist_ok=True)
    outputDir.mkdir(parents=True, exist_ok=True)
    pendingLines = [
        lineData for lineData in selectedLines
        if forceLines or not (outputDir / f"{lineData['id']}.mp3").exists()
    ]
    if not pendingLines:
        print("所选台词均已烘焙，跳过克隆阶段")
        return

    cloneModel = LoadModel(
        castData["cloneModel"], castData.get("cloneRevision"), device
    )
    try:
        rolesInOrder = list(dict.fromkeys(lineData["voice"] for lineData in pendingLines))
        completedCount = 0
        for roleName in rolesInOrder:
            roleData = castData["roles"][roleName]
            referencePath = ReferencePath(referenceDir, roleName, roleData)
            if not referencePath.exists():
                raise RuntimeError(f"缺角色参考声线：{referencePath}")
            ValidateReference(referencePath, roleData)
            clonePrompt = cloneModel.create_voice_clone_prompt(
                ref_audio=str(referencePath),
                ref_text=roleData["referenceText"],
            )
            roleLines = [lineData for lineData in pendingLines if lineData["voice"] == roleName]
            roleLanguage = roleData.get("language", castData["language"])
            for offset in range(0, len(roleLines), batchSize):
                lineBatch = roleLines[offset:offset + batchSize]
                SetSeed(int(roleData["seed"]) + offset + 1000)
                texts = [lineData["text"] for lineData in lineBatch]
                textArg = texts[0] if len(texts) == 1 else texts
                languageArg = roleLanguage if len(texts) == 1 else [roleLanguage] * len(texts)
                wavs, sampleRate = cloneModel.generate_voice_clone(
                    text=textArg,
                    language=languageArg,
                    voice_clone_prompt=clonePrompt,
                )
                for lineData, wav in zip(lineBatch, wavs, strict=True):
                    trimmedWav = TrimWave(wav, sampleRate)
                    wavPath = wavDir / f"{lineData['id']}.wav"
                    mp3Path = outputDir / f"{lineData['id']}.mp3"
                    sf.write(wavPath, trimmedWav, sampleRate, subtype="PCM_16")
                    EncodeMp3(wavPath, mp3Path, ffmpegPath)
                    lineData["dur"] = round(len(trimmedWav) / sampleRate, 2)
                    completedCount += 1
                    print(f"[{completedCount}/{len(pendingLines)}] {roleName} {lineData['id']}  {lineData['text']}")
                if not preview:
                    WriteJson(manifestPath, manifestData)
    finally:
        del cloneModel
        ClearCuda()


def Main() -> None:
    args = ParseArgs()
    castData = LoadJson(args.cast.resolve())
    if args.designModel:
        castData["designModel"] = args.designModel
    if args.designRevision:
        castData["designRevision"] = args.designRevision
    if args.cloneModel:
        castData["cloneModel"] = args.cloneModel
    if args.cloneRevision:
        castData["cloneRevision"] = args.cloneRevision
    manifestPath = args.manifest.resolve()
    manifestData = LoadJson(manifestPath)
    availableRoles = set(castData["roles"])
    requestedRoles = set(args.role) if args.role else {
        lineData["voice"] for lineData in manifestData["lines"]
    }
    unknownRoles = requestedRoles - availableRoles
    if unknownRoles:
        raise RuntimeError("未知角色声线：" + ", ".join(sorted(unknownRoles)))

    requestedLineIds = set(args.lineId)
    selectedLines = SelectedLines(manifestData, requestedRoles, requestedLineIds)
    if requestedLineIds:
        foundLineIds = {lineData["id"] for lineData in selectedLines}
        missingLineIds = requestedLineIds - foundLineIds
        if missingLineIds:
            raise RuntimeError("清单里没有台词 id：" + ", ".join(sorted(missingLineIds)))
    if not selectedLines and args.stage in ("bake", "all"):
        raise RuntimeError("没有符合筛选条件的台词")

    workDir = args.workDir.resolve()
    referenceDir = args.referenceDir.resolve()
    if args.stage in ("design", "all"):
        GenerateReferences(
            castData,
            sorted(requestedRoles),
            referenceDir,
            args.device,
            args.forceReference,
        )
    if args.stage in ("bake", "all"):
        BakeLines(
            castData,
            manifestData,
            selectedLines,
            referenceDir,
            workDir,
            args.outputDir.resolve(),
            args.device,
            args.ffmpeg,
            args.batchSize,
            args.forceLines,
            args.preview,
            manifestPath,
        )

    if not args.preview:
        manifestData["voiceRelease"] = {
            "release": castData["release"],
            "engine": "Qwen3-TTS",
            "designModel": castData["designModel"],
            "designRevision": castData.get("designRevision"),
            "cloneModel": castData["cloneModel"],
            "cloneRevision": castData.get("cloneRevision"),
            "language": castData["language"],
            "modelLicense": castData["modelLicense"],
            "sampleRate": 24000,
            "bitrateKbps": 48,
            "realVoiceReferenceUsed": False,
        }
        WriteJson(manifestPath, manifestData)


if __name__ == "__main__":
    Main()
