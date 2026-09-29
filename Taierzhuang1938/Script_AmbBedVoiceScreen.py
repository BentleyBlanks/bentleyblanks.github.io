"""环境床人声筛查：一段音频里有没有人在说话 / 喊 / 叫 / 哼。

用途：2026-09-29 用户说「默认环境音里有太多奇奇怪怪的人声」，要重做战场远景床。
床里混进一句人声，玩家会听成「一群听不清在喊什么的人」，而我们没有耳朵，只能靠客观量。
这里给三道互相独立的检查，任何一道命中都不算「干净」：

  1. Silero VAD（faster-whisper 自带的 onnx 模型）：逐段数出被判成语音的秒数。阈值 0.5 是标准口径，
     0.3 是加严口径。枪声、爆炸的瞬态偶尔会被判成语音，所以命中后要看时间点再定，不是「命中就扔」。
  2. Whisper medium 转写（中文与英文各跑一遍，不开 VAD 前置，不带上文）。**Whisper 在噪声与音调声上会幻觉出整句话**
     （署名、「我最喜欢的一段视频」……，还会给出超出片段时长的时间戳），所以只把「片段内、非套话、
     no_speech < 0.4 且 avg_logprob > −1.0」的文字算证据（words），其余记在 doubtful / ghosts 里备查。
  3. 基频连续段：先过 150–3400 Hz 人声带（不滤的话炮群的低频隆隆会让小滞后处的自相关恒高），
     40 ms 帧的归一化自相关，85–380 Hz 内谐波性 ≥ 0.6、是局部峰值、相邻帧 F0 变化 ≤ 8%、连续 ≥ 0.24 s。
     人的元音、呻吟、口哨都会命中；发动机、螺旋桨也会命中，所以命中要回头对时间点再定。

用法：
    python Taierzhuang1938/Script_AmbBedVoiceScreen.py --out result.json a.mp3 b.mp3 ...
    python Taierzhuang1938/Script_AmbBedVoiceScreen.py --fast a.mp3       # 只跑 VAD 与基频，不加载 Whisper

输出 JSON：{ "<文件名>": { seconds, vad: {...}, asr: {...}, pitch: {...}, verdict } }。
verdict = "clean"（三道都没提示）/ "suspect"（VAD 0.3 ≥ 0.5 s、VAD 0.5 ≥ 0.3 s、有可信转写词、或基频连续段合计 ≥ 0.5 s）/
"voice"（VAD 0.5 判语音 ≥ 1 s）。候选床要求 clean；suspect 要按时间点复核后写明理由，voice 直接换掉那段。
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

import numpy as np

SR = 16000
FFMPEG = "ffmpeg"

# Whisper 在纯噪声上的常见幻觉套话：署名、感谢、方括号音效标签。命中这些不算人声。
HALLUCINATION = re.compile(
    r"(字幕|感谢观看|谢谢观看|请订阅|订阅|点赞|thanks for watching|thank you|subtitles|amara|"
    r"^\s*[\[\(（【].*[\]\)）】]\s*$|^\s*[♪♫\s\.。,，…-]*$)", re.I)


def Decode(path):
    result = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                            capture_output=True)
    if result.returncode != 0:
        raise SystemExit(f"ffmpeg 解不开 {path}: {result.stderr.decode(errors='replace')[:200]}")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def Vad(samples):
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    out = {}
    for name, threshold in (("t50", 0.5), ("t30", 0.3)):
        spans = get_speech_timestamps(samples, VadOptions(threshold=threshold, min_speech_duration_ms=100,
                                                          min_silence_duration_ms=200, speech_pad_ms=0), sampling_rate=SR)
        segments = [{"from": round(s["start"] / SR, 2), "to": round(s["end"] / SR, 2)} for s in spans]
        out[name] = {"speechS": round(sum(s["to"] - s["from"] for s in segments), 2), "segments": segments[:24]}
    return out


def PitchRuns(samples, frame=640, hop=256, fmin=85.0, fmax=380.0, minRun=15):
    """自相关基频轨迹（先过 150–3400 Hz 人声带，滤掉炮群与风的低频隆隆，否则小滞后处的自相关恒高）。"""
    if len(samples) < frame * 2:
        return {"runs": [], "voicedFrames": 0, "frames": 0}
    from scipy.signal import butter, sosfiltfilt
    sos = butter(2, [150.0, 3400.0], btype="bandpass", fs=SR, output="sos")
    samples = sosfiltfilt(sos, samples).astype(np.float32)
    lagMin, lagMax = int(SR / fmax), int(SR / fmin)
    window = np.hanning(frame).astype(np.float32)
    nfft = 2048
    f0 = []
    for start in range(0, len(samples) - frame, hop):
        x = samples[start:start + frame] * window
        energy = float(np.dot(x, x))
        if energy < 3e-8:                      # 带通后约 −65 dBFS 以下当静音
            f0.append(0.0)
            continue
        spectrum = np.fft.rfft(x, nfft)
        r = np.fft.irfft(spectrum * np.conj(spectrum), nfft)[:lagMax + 2]
        r = r / (r[0] + 1e-12)
        lag = lagMin + int(np.argmax(r[lagMin:lagMax + 1]))
        isPeak = 0 < lag - lagMin and r[lag] > r[lag - 1] and r[lag] >= r[lag + 1]   # 贴着边界的不算
        f0.append(SR / lag if (r[lag] >= 0.6 and isPeak) else 0.0)
    runs, current = [], []
    for i, f in enumerate(f0):
        if f > 0 and (not current or abs(np.log2(f / current[-1][1])) <= 0.115):
            current.append((i, f))
            continue
        if len(current) >= minRun:
            runs.append(current)
        current = [(i, f)] if f > 0 else []
    if len(current) >= minRun:
        runs.append(current)
    return {
        "frames": len(f0), "voicedFrames": int(sum(1 for f in f0 if f > 0)),
        "runs": [{"at": round(run[0][0] * hop / SR, 2), "durS": round(len(run) * hop / SR, 2),
                  "medianHz": round(float(np.median([f for _, f in run])))} for run in runs][:24],
        "runS": round(sum(len(run) * hop / SR for run in runs), 2),
    }


def DefaultModel():
    root = pathlib.Path.home() / ".cache/huggingface/hub/models--Systran--faster-whisper-medium/snapshots"
    hits = sorted(root.glob("*/model.bin"))
    if not hits:
        raise SystemExit("faster-whisper medium 不在 Hugging Face 缓存里；用 --fast 只跑 VAD 与基频")
    return str(hits[0].parent)


def Transcribe(model, samples):
    """Whisper 在纯噪声与音调声上会幻觉出整句话（署名、「我最喜欢的一段视频」……），
    而且会给出超出片段时长的时间戳（它按 30 s 窗补零）。所以这里只保留片段内的、非套话的文字，
    并把「可信度高」（no_speech < 0.4 且 avg_logprob > −1.0）与其余分开报，判据只看前一类。"""
    duration = len(samples) / SR
    out = {}
    for lang in ("zh", "en"):
        segments, _info = model.transcribe(
            samples, language=lang, beam_size=1, temperature=0.0, vad_filter=False,
            condition_on_previous_text=False, word_timestamps=False)
        confident, doubtful, ghosts = [], [], []
        for seg in segments:
            text = seg.text.strip()
            if not text or seg.start >= duration:
                continue
            entry = {"from": round(seg.start, 2), "to": round(min(seg.end, duration), 2), "text": text[:60],
                     "noSpeech": round(seg.no_speech_prob, 2), "logprob": round(seg.avg_logprob, 2)}
            if HALLUCINATION.search(text):
                ghosts.append(entry)
            elif seg.no_speech_prob < 0.4 and seg.avg_logprob > -1.0:
                confident.append(entry)
            else:
                doubtful.append(entry)
        out[lang] = {"words": confident[:16], "doubtful": doubtful[:8], "ghosts": ghosts[:8]}
    return out


def Verdict(vad, asr, pitch):
    """voice：VAD 0.5 判语音 ≥ 1 s；suspect：任一道有提示；clean：三道都没有。"""
    speech, loose = vad["t50"]["speechS"], vad["t30"]["speechS"]
    words = sum(len(lang["words"]) for lang in asr.values()) if asr else 0
    if speech >= 1.0:
        return "voice"
    if loose >= 0.5 or speech >= 0.3 or words or pitch.get("runS", 0) >= 0.5:
        return "suspect"
    return "clean"


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*")
    parser.add_argument("--list", help="文本文件，每行一个音频路径（相对当前目录）")
    parser.add_argument("--out", help="结果 JSON 路径")
    parser.add_argument("--fast", action="store_true", help="不加载 Whisper")
    parser.add_argument("--model", default=None)
    args = parser.parse_args()
    if args.list:
        args.files += [line.strip() for line in pathlib.Path(args.list).read_text(encoding="utf-8").splitlines()
                       if line.strip() and not line.startswith("#")]
    if not args.files:
        raise SystemExit("没有给音频文件")
    model = None
    if not args.fast:
        from faster_whisper import WhisperModel
        model = WhisperModel(args.model or DefaultModel(), device="cpu", compute_type="int8", cpu_threads=8,
                             local_files_only=True)
    results = {}
    for name in args.files:
        path = pathlib.Path(name)
        samples = Decode(path)
        vad = Vad(samples)
        pitch = PitchRuns(samples)
        asr = Transcribe(model, samples) if model else None
        results[path.name] = {"seconds": round(len(samples) / SR, 2), "vad": vad, "pitch": pitch, "asr": asr,
                              "verdict": Verdict(vad, asr, pitch)}
        r = results[path.name]
        words = "" if not asr else " 转写词 zh/en=" + "/".join(str(len(asr[k]["words"])) for k in ("zh", "en"))
        print(f"{path.name}: {r['verdict']}  VAD0.5={vad['t50']['speechS']}s VAD0.3={vad['t30']['speechS']}s "
              f"基频段={len(pitch['runs'])}{words}", flush=True)
    if args.out:
        pathlib.Path(args.out).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(Main())
