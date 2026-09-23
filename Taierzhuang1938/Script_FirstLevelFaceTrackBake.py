"""Offline face tracks (mouth shapes) for first-level dialogue.

  PYTHONUTF8=1 py -3.13 Taierzhuang1938/Script_FirstLevelFaceTrackBake.py
      [--cues all|A,B]            whole-cue takes in Audio/FirstLevel (03-06 today, 07-18)
      [--lines [timings.json]]    per-line dry takes (Voice package, contract 5.2):
                                  Audio/FirstLevel/Data_FirstLevelLineTimings.json + Lines/*.mp3
      [--output file.json] [--prune] [--realign] [--model dir]

Output: Audio/FirstLevel/Data_FirstLevelFaceTracks.json, keyed by the sha256 of the
mp3 the track was baked from (Script_FaceTrack samples it). Existing tracks are kept
and merged; --prune drops tracks whose audio is no longer in the voice manifest or
the line timings.

How a track is made:
  * timing: every spoken character (Chinese) or kana (Japanese) gets a start time.
    Per-line takes bring it (Data_FirstLevelLineTimings.json, from the Voice
    package's aligner). Whole-cue takes are aligned here, line by line inside the
    existing line intervals (Data_FirstLevelMissionVoiceAlignment), with the same
    whisper cross-attention alignment as Script_FirstLevelVoiceAlign.py.
  * shape: hand-written tables (Data_FaceTrackPhonemes): Han -> pinyin -> onset
    (b/p/m close the lips, f bites the lip) + vowel sequence; kana -> vowel.
  * openness: speech-band (250-3500 Hz) energy of each syllable after spectral
    subtraction of the noise measured outside the lines (whole cues have ambience
    and gunfire baked in); quietest frames for dry per-line takes.
  * stress: syllables clearly louder than the cue median, local peaks, >=0.5 s apart.
Numbers live in Data_Tuning_CharacterSpeech.FACE_TRACK_BAKE.

Track format (all times in integer milliseconds, channels 0-100):
  { id, kind: "cue"|"line", file, who?, seconds, lines: [[startMs, endMs, who]],
    keys: [tMs, jaw, wide, round, close, tMs, ...], stress: [tMs, ...],
    chars: [[char, startMs, endMs]], textSha256, stats: {...} }
"""
import argparse, hashlib, json, pathlib, subprocess, sys
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent
AUDIO = ROOT / "Audio/FirstLevel"
FORMAT = 1
PUNCT = set("，。！？、；：“”‘’（）《》…—-,.!?;:'\"()[] \t\n「」『』・～~")
SR = 16000


def Node(script, node="node"):
    result = subprocess.run([node, "--input-type=module", "-e", script, ROOT.as_uri() + "/"],
                            check=True, capture_output=True, encoding="utf-8")
    return json.loads(result.stdout)


def ReadData(node):
    return Node("""
const root=process.argv[1];
const p=await import(root+'Data_FaceTrackPhonemes.mjs');
const t=await import(root+'Data_Tuning_CharacterSpeech.mjs');
const d=await import(root+'Data_FirstLevelMissionDialogue.mjs');
const a=await import(root+'Data_FirstLevelMissionVoiceAlignment.mjs');
process.stdout.write(JSON.stringify({
  readings:Object.fromEntries(p.HanReadings()), initials:p.PINYIN_INITIALS, onset:p.INITIAL_ONSET,
  finals:p.FINAL_VISEMES, kanaVowels:p.KANA_VOWELS, kanaOnset:p.KANA_ONSET, kanaSmall:p.KANA_SMALL,
  kanaViseme:p.KANA_VOWEL_VISEME, kanaSpecial:p.KANA_SPECIAL, visemes:p.VISEMES,
  bake:t.FACE_TRACK_BAKE, cues:d.MissionVoiceAlignmentCues(), alignment:a.MISSION_VOICE_ALIGNMENT}));
""", node)


def Normalize(text):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text if c not in PUNCT)


def Spoken(text):
    """Spoken characters of a line with a flag: a punctuation mark precedes it."""
    out, brk = [], False
    for c in text:
        if c in PUNCT:
            brk = True
            continue
        c = chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c
        out.append((c, brk))
        brk = False
    return out


class Phonemes:
    def __init__(self, data):
        self.readings = data["readings"]; self.initials = data["initials"]; self.onset = data["onset"]
        self.finals = data["finals"]; self.vis = {k: np.array(v, float) for k, v in data["visemes"].items()}
        self.kana = {}
        for vowel, chars in data["kanaVowels"].items():
            for c in chars: self.kana[c] = vowel
        self.kanaOnset = {}
        for viseme, chars in data["kanaOnset"].items():
            for c in chars: self.kanaOnset[c] = viseme
        self.kanaSmall = data["kanaSmall"]; self.kanaViseme = data["kanaViseme"]; self.kanaSpecial = data["kanaSpecial"]
        self.missing = set()

    def Pinyin(self, syllable):
        initial = next((i for i in self.initials if syllable.startswith(i)), "")
        final = syllable[len(initial):]
        if initial == "" and syllable[0] in "yw":
            rest = syllable[1:]
            if syllable[0] == "y":
                if rest.startswith("u"): final = "ü" + rest[1:]
                elif rest.startswith("i"): final = rest
                else: final = "i" + rest
            else:
                final = rest if rest.startswith("u") else "u" + rest
        if initial in ("j", "q", "x") and final.startswith("u"): final = "ü" + final[1:]
        final = final.replace("v", "ü")
        final = {"iu": "iou", "ui": "uei", "un": "uen", "üen": "ün", "ue": "üe"}.get(final, final)
        if final == "i" and initial in ("z", "c", "s", "zh", "ch", "sh", "r"): final = "apical"
        if final not in self.finals: raise KeyError(syllable + " -> " + final)
        return self.onset.get(initial), list(self.finals[final])

    def Syllables(self, chars, lang):
        """chars: [(c, start, end, brk)] -> [{c, s, e, brk, onset, body}] (small kana merged)."""
        out = []
        for index, (c, s, e, brk) in enumerate(chars):
            if lang == "ja" or c in self.kana or c in self.kanaSpecial or c in self.kanaSmall:
                if c in self.kanaSmall and out:
                    out[-1]["body"] = [self.kanaViseme[self.kanaSmall[c]]]; out[-1]["e"] = max(out[-1]["e"], e)
                    continue
                special = self.kanaSpecial.get(c)
                if special == "LONG":
                    body = list(out[-1]["body"][-1:]) if out else ["A"]
                    out.append(dict(c=c, s=s, e=e, brk=brk, onset=None, body=body)); continue
                if special == "Q":
                    out.append(dict(c=c, s=s, e=e, brk=brk, onset=None, body=["Q"], fixed=True)); continue
                if special == "N":
                    nxt = chars[index + 1][0] if index + 1 < len(chars) else ""
                    body = ["MB"] if self.kanaOnset.get(nxt) == "MB" else ["N"]
                    out.append(dict(c=c, s=s, e=e, brk=brk, onset=None, body=body, fixed=body == ["MB"])); continue
                vowel = self.kana.get(c)
                if vowel is None:
                    self.missing.add(c); vowel = "a"
                out.append(dict(c=c, s=s, e=e, brk=brk, onset=self.kanaOnset.get(c), body=[self.kanaViseme[vowel]]))
                continue
            syllable = self.readings.get(c)
            if syllable is None:
                self.missing.add(c)
                out.append(dict(c=c, s=s, e=e, brk=brk, onset=None, body=["E"])); continue
            onset, body = self.Pinyin(syllable)
            out.append(dict(c=c, s=s, e=e, brk=brk, onset=onset, body=body))
        return out


def Pitch(samples, bake):
    """(times, strength): normalised autocorrelation peak at 80-400 Hz lags, 10 ms hop."""
    from scipy.signal import butter, sosfiltfilt
    b = bake
    hop = int(round(b["hopS"] * SR)); win = int(round(b["pitchWindowS"] * SR))
    sos = butter(4, [b["pitchBandLowHz"], b["pitchBandHighHz"]], btype="band", fs=SR, output="sos")
    y = sosfiltfilt(sos, samples).astype(np.float32)
    count = max(1, 1 + (len(y) - win) // hop)
    frames = np.lib.stride_tricks.as_strided(np.pad(y, (0, win)), shape=(count, win),
                                             strides=(y.strides[0] * hop, y.strides[0]))
    frames = frames - frames.mean(axis=1, keepdims=True)
    taper = np.hanning(win)
    ac = np.fft.irfft(np.abs(np.fft.rfft(frames * taper, n=2 * win)) ** 2)[:, :win]
    ac = ac / np.maximum(np.fft.irfft(np.abs(np.fft.rfft(taper, n=2 * win)) ** 2)[:win], 1e-9)
    lo, hi = int(SR / 400), int(SR / 80)
    strength = np.clip((ac[:, lo:hi + 1] / np.maximum(ac[:, :1], 1e-12)).max(axis=1), 0, 1)
    from scipy.signal import medfilt
    strength = medfilt(strength, b["pitchMedianFrames"])
    return np.arange(count) * b["hopS"] + b["pitchWindowS"] / 2, strength


class Energy:
    """Speech-band energy per 10 ms frame, with spectral subtraction of a noise profile."""
    def __init__(self, samples, bake):
        hop = int(round(bake["hopS"] * SR)); win = int(round(bake["windowS"] * SR))
        self.hop = bake["hopS"]
        count = max(1, 1 + (len(samples) - win) // hop)
        window = np.hanning(win).astype(np.float32)
        frames = np.lib.stride_tricks.as_strided(np.pad(samples, (0, win)), shape=(count, win),
                                                 strides=(samples.strides[0] * hop, samples.strides[0]))
        spectrum = np.abs(np.fft.rfft(frames * window, n=512)) ** 2
        freqs = np.fft.rfftfreq(512, 1 / SR)
        self.band = (freqs >= bake["bandLowHz"]) & (freqs <= bake["bandHighHz"])
        self.power = spectrum[:, self.band]
        self.bake = bake
        self.times = np.arange(count) * self.hop + bake["windowS"] / 2
        self.pitch = np.interp(self.times, *Pitch(samples, bake))

    def Speech(self):
        """Frames that are loud enough over the noise and near a pitched frame."""
        b = self.bake
        reach = max(0, int(round(b["speechReachS"] / b["hopS"])))
        pitched = np.convolve((self.pitch >= b["pitchMin"]).astype(float), np.ones(2 * reach + 1), "same") > 0
        return (self.db >= self.voicedDb) & pitched

    def Denoise(self, noise_mask, source):
        b = self.bake
        if noise_mask.sum() >= b["noiseMinFrames"]:
            noise = self.power[noise_mask].mean(axis=0)
        else:
            raw = self.power.sum(axis=1)
            quiet = raw <= np.percentile(raw, 10)
            noise = self.power[quiet].mean(axis=0); source = "quietest10"; noise_mask = quiet
        clean = np.maximum(self.power - b["noiseOverSubtract"] * noise, b["noiseFloorKeep"] * self.power)
        self.clean = clean.sum(axis=1)
        self.db = 10 * np.log10(self.clean + 1e-12)
        floor = np.median(self.db[noise_mask]) if noise_mask.any() else np.percentile(self.db, 10)
        self.voicedDb = floor + b["voicedAboveNoiseDb"]
        self.noiseSource = source
        self.speech = self.Speech()
        return self

    def Frames(self, start, end):
        return (self.times >= start) & (self.times < end)


def CollapsePhrases(rows, bake, label):
    """rows [(c, s, e, brk)] of one line -> same, with long silences inside a phrase closed."""
    b = bake
    rows = [list(r) for r in rows]
    phrases, current = [], []
    for i, r in enumerate(rows):
        if r[3] and current: phrases.append(current); current = []
        current.append(i)
    if current: phrases.append(current)
    length = lambda j: min(b["phraseCharMaxS"], max(b["phraseCharMinS"], rows[j][2] - rows[j][1]))
    for idx in phrases:
        while len(idx) > 1:
            gap, k = max((rows[idx[k + 1]][1] - rows[idx[k]][2], k) for k in range(len(idx) - 1))
            if gap <= b["phraseGapS"]: break
            left, right = idx[:k + 1], idx[k + 1:]
            if len(left) <= len(right):
                t = rows[right[0]][1]; moved = left
                for j in reversed(left):
                    d = length(j); rows[j][2] = t; rows[j][1] = t - d; t -= d
            else:
                t = rows[left[-1]][2]; moved = right
                for j in right:
                    d = length(j); rows[j][1] = t; rows[j][2] = t + d; t += d
            print("SNAP", label, "".join(rows[j][0] for j in moved), f"gap {gap:.2f}s", flush=True)
    return [tuple(r) for r in rows]


def Scale(v, a):
    return np.array([v[0] * a, v[1] * (.5 + .5 * a), v[2] * (.5 + .5 * a), v[3]])


def BuildKeys(lines, energy, ph, bake):
    """lines: [{who, start, end, syllables}] (seconds) -> keys [(t, vec)], stress [t], chars."""
    b = bake; vis = ph.vis; keys = []; stress = []; chars = []
    # Syllable energies first (cue-wide median for stress, per-line p90 for openness).
    for line in lines:
        syl = line["syllables"]
        for i, x in enumerate(syl):
            s = x["s"]; nxt = syl[i + 1] if i + 1 < len(syl) else None
            natural = max(x["e"], s + b["minSyllableS"])
            if nxt and not nxt["brk"] and nxt["s"] - s <= b["maxSyllableS"] and nxt["s"] > s:
                e = nxt["s"]
            else:
                e = min(s + b["maxSyllableS"], natural + b["tailPadS"])
                if nxt: e = min(e, max(s + .05, nxt["s"] - .03))
                # Phrase-final: stay open while the voice actually continues.
                frames = np.where(energy.Frames(e, min(s + b["maxSyllableS"], nxt["s"] - .05 if nxt else s + b["maxSyllableS"])))[0]
                for f in frames:
                    if not energy.speech[f]: break
                    e = energy.times[f] + b["hopS"] / 2
            x["span"] = (s, max(min(e, line["end"] + b["lineEndPadS"]), s + .05))
            mask = energy.Frames(*x["span"])
            x["energy"] = float(energy.clean[mask].max()) if mask.any() else 0.0
            x["audible"] = bool(energy.speech[mask].any())
            chars.append([x["c"], s, x["span"][1]])
    audible = [x["energy"] for line in lines for x in line["syllables"] if x["audible"]]
    median = float(np.median(audible)) if audible else 0.0
    last_stress = -9.0
    for line in lines:
        syl = line["syllables"]
        if not syl: continue
        loud = [x["energy"] for x in syl if x["audible"]]
        p90 = float(np.percentile(loud, 90)) if loud else 0.0
        keys.append((syl[0]["span"][0] - b["restLeadS"], vis["REST"]))
        for i, x in enumerate(syl):
            s, e = x["span"]; dur = e - s
            if x["audible"] and p90 > 0:
                a = b["ampFloor"] + (1 - b["ampFloor"]) * min(1.0, x["energy"] / p90) ** b["ampGamma"]
            else:
                a = b["quietSyllableAmp"]
            prev = syl[i - 1] if i else None
            continuous = prev is not None and s - prev["span"][1] < b["pauseGapS"]
            if prev is not None and not continuous:
                keys.append((prev["span"][1] + b["restTailS"], vis["REST"]))
                keys.append((s - b["restLeadS"], vis["REST"]))
            t0 = s
            body = x["body"]
            if x["onset"]:
                o = vis[x["onset"]]
                keys.append((s, o if x["onset"] in ("MB", "FV") else Scale(o, a)))
                t0 = s + min(b["onsetShare"] * dur, b["onsetS"])
            elif continuous:
                keys.append((s, Scale(vis[body[0]], a) * b["boundaryDip"]))
            fractions = {1: [.45], 2: [.35, .85], 3: [.2, .55, .9]}[min(3, len(body))]
            nucleus = max(range(len(body)), key=lambda k: vis[body[k]][0]) if len(body) > 1 else 0
            for k, (v, f) in enumerate(zip(body, fractions)):
                if x.get("fixed"):
                    value = vis[v]
                else:
                    w = 1.0 if k == nucleus else (b["glideWeight"] if k < nucleus else b["tailWeight"])
                    value = Scale(vis[v], a * w)
                keys.append((t0 + f * (e - t0), value))
            # Stress: loud local peak, spaced out.
            if (x["audible"] and median > 0 and x["energy"] >= b["stressRatio"] * median
                    and (prev is None or x["energy"] >= prev["energy"])
                    and (i + 1 >= len(syl) or x["energy"] >= syl[i + 1]["energy"])
                    and s - last_stress >= b["stressMinGapS"]):
                t = t0 + fractions[nucleus] * (e - t0) - .03
                stress.append(t); last_stress = s
        keys.append((syl[-1]["span"][1] + b["restTailS"], vis["REST"]))
    keys.sort(key=lambda k: k[0])
    merged = []
    for t, v in keys:
        t = max(0.0, t)
        if merged and t - merged[-1][0] < .005: merged[-1] = (merged[-1][0], v)
        else: merged.append((t, v))
    return merged, stress, chars


def Sample(keys, times):
    kt = np.array([k[0] for k in keys]); kv = np.array([k[1] for k in keys])
    out = np.zeros((len(times), 4))
    idx = np.searchsorted(kt, times, side="right")
    for n, (t, i) in enumerate(zip(times, idx)):
        if i == 0 or i >= len(kt): continue
        u = (t - kt[i - 1]) / max(1e-6, kt[i] - kt[i - 1]); u = u * u * (3 - 2 * u)
        out[n] = kv[i - 1] + (kv[i] - kv[i - 1]) * u
    return out


def Stats(keys, energy, lines, bake):
    b = bake
    values = Sample(keys, energy.times)
    jaw, close = values[:, 0], values[:, 3]
    reach = max(1, int(round(b["movingWindowS"] / b["hopS"])))
    articulate = ((jaw >= b["openJaw"]) | (close >= .5) | (values[:, 1] >= b["shapeVisible"])
                  | (values[:, 2] >= b["shapeVisible"]))
    moving = np.convolve(articulate.astype(float), np.ones(2 * reach + 1), "same") > 0
    inside = np.zeros(len(energy.times), bool); outside = np.ones(len(energy.times), bool)
    for line in lines:
        inside |= energy.Frames(line["start"], line["end"])
        outside &= ~energy.Frames(line["start"] - .05, line["end"] + .1)
    voiced = inside & energy.speech
    # Openings: local jaw maxima that rise at least .12 over the dip before them.
    peaks = 0; low = 1.0
    for n in range(1, len(jaw) - 1):
        low = min(low, jaw[n])
        if jaw[n] >= jaw[n - 1] and jaw[n] > jaw[n + 1] and jaw[n] >= .2 and jaw[n] - low >= .12:
            peaks += 1; low = jaw[n]
    speech_s = sum(line["end"] - line["start"] for line in lines) or 1e-6
    syllables = sum(len(line["syllables"]) for line in lines)
    return {
        "voicedFrames": int(voiced.sum()),
        "voicedMoving": round(float(moving[voiced].mean()), 4) if voiced.any() else None,
        "gapFrames": int(outside.sum()),
        "gapOpen": round(float((jaw[outside] >= b["openJaw"]).mean()), 4) if outside.any() else 0.0,
        "syllablesPerS": round(syllables / speech_s, 2), "opensPerS": round(peaks / speech_s, 2),
        "noise": energy.noiseSource,
    }


def Quantize(keys, stress, chars, lines):
    flat = []
    for t, v in keys:
        flat.append(int(round(t * 1000)))
        flat.extend(int(round(min(1, max(0, c)) * 100)) for c in v)
    return {
        "lines": [[int(round(l["start"] * 1000)), int(round(l["end"] * 1000)), l["who"]] for l in lines],
        "keys": flat, "stress": [int(round(t * 1000)) for t in stress],
        "chars": [[c, int(round(s * 1000)), int(round(e * 1000))] for c, s, e in chars],
    }


class Aligner:
    """Loads whisper only when a line actually needs aligning (re-bakes reuse cached timings)."""
    def __init__(self, model_dir):
        self.model_dir = model_dir; self._model = None

    @property
    def model(self):
        if self._model is None: self._model = self._Load(self.model_dir)
        return self._model

    @staticmethod
    def _Load(model_dir):
        from faster_whisper import WhisperModel
        if not model_dir:
            root = pathlib.Path.home() / ".cache/huggingface/hub/models--Systran--faster-whisper-medium/snapshots"
            hits = sorted(root.glob("*/model.bin"))
            if not hits: raise SystemExit("faster-whisper medium not in the Hugging Face cache; pass --model")
            model_dir = str(hits[0].parent)
        return WhisperModel(model_dir, device="cpu", compute_type="int8", cpu_threads=8, local_files_only=True)

    def Chars(self, samples, start, end, text, lang):
        """Per-character start/end (seconds, file-relative) for one line inside [start, end]."""
        from faster_whisper.audio import pad_or_trim
        from faster_whisper.tokenizer import Tokenizer
        audio = samples[int(start * SR):int(end * SR)]
        spoken = Normalize(text)
        tokenizer = Tokenizer(self.model.hf_tokenizer, self.model.model.is_multilingual, task="transcribe", language=lang)
        encoded = self.model.encode(pad_or_trim(self.model.feature_extractor(audio)))
        frame_count = min(3000, int(np.ceil(len(audio) / 160)))
        words = self.model.find_alignment(tokenizer, [tokenizer.encode(spoken)], encoded, frame_count)[0]
        out = []
        for w in words:
            piece = Normalize(w["word"])
            if not piece: continue
            span = (w["end"] - w["start"]) / len(piece)
            for k, c in enumerate(piece):
                out.append([c, start + w["start"] + k * span, start + w["start"] + (k + 1) * span])
        if "".join(c for c, _, _ in out) != spoken:
            print("REVIEW alignment text mismatch; spreading evenly:", spoken, "".join(c for c, _, _ in out), flush=True)
            step = (end - start) / max(1, len(spoken))
            out = [[c, start + k * step, start + (k + 1) * step] for k, c in enumerate(spoken)]
        return out


def Sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def BakeCue(cue, align_row, data, ph, aligner, cached):
    from faster_whisper.audio import decode_audio
    b = data["bake"]
    path = AUDIO / cue["file"]
    digest = Sha(path)
    if align_row.get("sha256") != digest:
        print("SKIP", cue["id"], "alignment is for another take", flush=True); return None, None
    text_sha = hashlib.sha256(json.dumps([[l["who"], l["text"], l["lang"]] for l in cue["lines"]], ensure_ascii=False).encode()).hexdigest()
    samples = decode_audio(str(path), sampling_rate=SR)
    seconds = len(samples) / SR
    ranges = align_row["lines"]
    reuse = cached and cached.get("textSha256") == text_sha and cached.get("chars")
    per_line_chars = []
    if reuse:
        flat = cached["chars"]; cursor = 0
        for line in cue["lines"]:
            n = len(Normalize(line["text"]))
            per_line_chars.append([[c, s / 1000, e / 1000] for c, s, e in flat[cursor:cursor + n]]); cursor += n
    else:
        for index, line in enumerate(cue["lines"]):
            start, end = ranges[index]
            lo = max(ranges[index - 1][1] if index else 0.0, start - b["lineWindowPadS"])
            hi = min(ranges[index + 1][0] if index + 1 < len(ranges) else seconds, end + b["lineWindowPadS"])
            hi = min(hi, lo + 30)
            per_line_chars.append(aligner.Chars(samples, lo, hi, line["text"], line["lang"]))
    energy = Energy(samples, b)
    gap = np.ones(len(energy.times), bool)
    for start, end in ranges: gap &= ~energy.Frames(start - b["noiseGapPadS"], end + b["noiseGapPadS"])
    energy.Denoise(gap, "gaps")
    # chars in the track are the raw alignment (re-bakes reuse them and redo the rest).
    lines, chars = [], []
    for index, line in enumerate(cue["lines"]):
        start, end = ranges[index]
        spoken = Spoken(line["text"])
        rows = []
        for (c, brk), (_, s, e) in zip(spoken, per_line_chars[index]):
            chars.append([c, s, e])
            # Keep syllables inside the interval the voice module treats as this line.
            s = min(max(s, start), end - .04); e = min(max(e, s + .02), end)
            rows.append((c, s, e, brk))
        rows = CollapsePhrases(rows, b, f"{cue['id']}:{index}")
        lines.append(dict(who=line["who"], start=start, end=end, syllables=ph.Syllables(rows, line["lang"])))
    keys, stress, _ = BuildKeys(lines, energy, ph, b)
    track = {"id": cue["id"], "kind": "cue", "file": cue["file"], "seconds": round(seconds, 3),
             "textSha256": text_sha, **Quantize(keys, stress, chars, lines), "stats": Stats(keys, energy, lines, b)}
    return digest, track


def BakeLine(digest, row, lines_dir, data, ph):
    from faster_whisper.audio import decode_audio
    b = data["bake"]
    scene, _, number = row["lineId"].rpartition(".")
    path = lines_dir / f"AudioVoice_FirstLevel{scene}_{int(number):02d}.mp3"
    if not path.exists() or Sha(path) != digest:
        print("SKIP", row["lineId"], "no matching per-line file", flush=True); return None
    samples = decode_audio(str(path), sampling_rate=SR)
    seconds = len(samples) / SR
    raw = [(c, float(s), float(e)) for c, s, e in row.get("chars") or []]
    if not raw:
        print("SKIP", row["lineId"], "no character timings", flush=True); return None
    # Line timings carry no punctuation: a silence over pauseGapS counts as a break.
    rows = []
    for i, (c, s, e) in enumerate(raw):
        brk = i > 0 and s - raw[i - 1][2] > b["pauseGapS"] * 1.5
        rows.append((c, s, e, brk))
    lang = row.get("lang", "zh")
    start, end = raw[0][1], max(raw[-1][2], raw[-1][1] + b["minSyllableS"])
    rows = CollapsePhrases(rows, b, row["lineId"])
    lines = [dict(who=row.get("who"), start=start, end=min(seconds, end + b["tailPadS"]), syllables=ph.Syllables(rows, lang))]
    energy = Energy(samples, b)
    energy.Denoise(np.zeros(len(energy.times), bool), "quietest10")
    keys, stress, _ = BuildKeys(lines, energy, ph, b)
    chars = [[c, s, e] for c, s, e in raw]
    text_sha = hashlib.sha256("".join(c for c, _, _ in raw).encode()).hexdigest()
    return {"id": row["lineId"], "kind": "line", "file": path.name, "who": row.get("who"), "seconds": round(seconds, 3),
            "textSha256": text_sha, **Quantize(keys, stress, chars, lines), "stats": Stats(keys, energy, lines, b)}


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cues", help="all, or comma-separated cue ids (whole-cue takes)")
    parser.add_argument("--lines", nargs="?", const=str(AUDIO / "Data_FirstLevelLineTimings.json"),
                        help="per-line timings JSON (default Audio/FirstLevel/Data_FirstLevelLineTimings.json)")
    parser.add_argument("--lines-dir", default=str(AUDIO / "Lines"))
    parser.add_argument("--output", default=str(AUDIO / "Data_FirstLevelFaceTracks.json"))
    parser.add_argument("--prune", action="store_true")
    parser.add_argument("--realign", action="store_true", help="ignore cached character timings")
    parser.add_argument("--model")
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    data = ReadData(args.node)
    ph = Phonemes(data)
    output = pathlib.Path(args.output)
    existing = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {}
    tracks = dict(existing.get("tracks", {}))
    by_id = {t["id"]: (k, t) for k, t in tracks.items()}
    aligner = Aligner(args.model)
    if args.cues:
        cues = [c for c in data["cues"] if args.cues == "all" or c["id"] in set(args.cues.split(","))]
        for cue in cues:
            row = data["alignment"].get(cue["id"])
            if not row or not (AUDIO / cue["file"]).exists():
                print("SKIP", cue["id"], "no recording or alignment", flush=True); continue
            old_key, cached = by_id.get(cue["id"], (None, None))
            if args.realign: cached = None
            digest, track = BakeCue(cue, row, data, ph, aligner, cached)
            if not track: continue
            if old_key and old_key != digest: tracks.pop(old_key, None)
            tracks[digest] = track
            print(cue["id"], json.dumps(track["stats"]), flush=True)
    line_rows = {}
    if args.lines:
        line_rows = json.loads(pathlib.Path(args.lines).read_text(encoding="utf-8"))
        for digest, row in line_rows.items():
            track = BakeLine(digest, row, pathlib.Path(args.lines_dir), data, ph)
            if not track: continue
            old_key, _ = by_id.get(track["id"], (None, None))
            if old_key and old_key != digest: tracks.pop(old_key, None)
            tracks[digest] = track
            print(track["id"], json.dumps(track["stats"]), flush=True)
    if args.prune:
        manifest = json.loads((AUDIO / "Data_FirstLevelVoiceManifest.json").read_text(encoding="utf-8"))
        live = {entry.get("sha256") for entry in manifest.get("cues", {}).values()}
        live |= {entry.get("sha256") for entry in manifest.get("lines", {}).values()} if isinstance(manifest.get("lines"), dict) else set()
        default_lines = AUDIO / "Data_FirstLevelLineTimings.json"
        if default_lines.exists(): live |= set(json.loads(default_lines.read_text(encoding="utf-8")))
        live |= set(line_rows)
        for key in [k for k in tracks if k not in live]:
            print("PRUNE", tracks[key]["id"], flush=True); tracks.pop(key)
    if ph.missing:
        print("MISSING shapes for", "".join(sorted(ph.missing)), "- add them to Data_FaceTrackPhonemes", flush=True)
    tables = hashlib.sha256(json.dumps({k: data[k] for k in ("readings", "finals", "visemes", "bake")}, sort_keys=True,
                                       ensure_ascii=False).encode()).hexdigest()
    ordered = dict(sorted(tracks.items(), key=lambda kv: (kv[1]["kind"], kv[1]["id"])))
    body = {"format": FORMAT, "generator": "Script_FirstLevelFaceTrackBake.py",
            "note": "Face tracks keyed by the sha256 of the mp3; times in ms, channels 0-100 (jaw, wide, round, close).",
            "channels": ["jaw", "wide", "round", "close"], "tablesSha256": tables, "tracks": ordered}
    # One track per line keeps the diff readable and the file compact.
    text = "{\n" + ",\n".join(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in body.items() if k != "tracks")
    text += ',\n "tracks": {\n' + ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(',', ':'))}"
                                            for k, v in ordered.items()) + "\n }\n}\n"
    output.write_text(text, encoding="utf-8")
    print("wrote", len(ordered), "tracks", f"{output.stat().st_size / 1024:.1f} KB", flush=True)
    if ph.missing: sys.exit(2)


if __name__ == "__main__":
    Main()
