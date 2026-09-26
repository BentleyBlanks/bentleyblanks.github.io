# 说话人音色向量：给配音 baker 和门禁量「是不是同一个嗓子」。
#
#   py -3.10 Taierzhuang1938/Script_FirstLevelVoiceSpeaker.py <a.mp3> [b.mp3 ...] [--json out.json]
#   py -3.10 Taierzhuang1938/Script_FirstLevelVoiceSpeaker.py --list files.txt --json out.json
#
# 用的是本机 Hugging Face 缓存里 Qwen3-TTS-12Hz-1.7B-Base 自带的说话人编码器
# （ECAPA-TDNN，128 维 24 kHz 对数梅尔输入，输出 2048 维）。只读 safetensors 里
# speaker_encoder.* 这 76 个张量，网络结构在这里手写，不装任何新包（torch 在 py3.10 里）。
# 找不到权重或 torch 时退出码 3，调用方退回 MFCC 粗指标。
#
# 输出：每个文件一个 L2 归一化向量；不给 --json 时打印两两余弦相似度（1 = 同一个声音）。
import json, os, struct, subprocess, sys, glob
import numpy as np

SR = 24000


def FindWeights():
    # An extracted, unmodified speaker_encoder.* safetensors subset avoids needing
    # the unrelated multi-gigabyte speech generator on a voice-validation machine.
    explicit = os.environ.get('VOICE_SPEAKER_WEIGHTS')
    if explicit:
        return explicit if os.path.isfile(explicit) else None
    root = os.path.expanduser("~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-1.7B-Base/snapshots")
    hits = glob.glob(os.path.join(root, "*", "model.safetensors"))
    return hits[0] if hits else None


def LoadSpeakerTensors(path):
    import torch
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n))
        base = 8 + n
        out = {}
        for key, meta in header.items():
            if not key.startswith("speaker_encoder."):
                continue
            a, b = meta["data_offsets"]
            f.seek(base + a)
            raw = f.read(b - a)
            assert meta["dtype"] == "BF16", meta["dtype"]
            u32 = np.frombuffer(raw, dtype=np.uint16).astype(np.uint32) << 16
            out[key[len("speaker_encoder."):]] = torch.from_numpy(u32.view(np.float32).reshape(meta["shape"]).copy())
    return out


def Decode(file):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", file, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).copy()


def SlaneyMel(sr, n_fft, n_mels, fmin, fmax):
    # librosa.filters.mel(htk=False, norm="slaney") 的手写版。
    def HzToMel(f):
        f = np.asarray(f, dtype=np.float64)
        lin = f / (200.0 / 3)
        log = 15.0 + np.log(np.maximum(f, 1e-10) / 1000.0) / (np.log(6.4) / 27.0)
        return np.where(f >= 1000.0, log, lin)

    def MelToHz(m):
        m = np.asarray(m, dtype=np.float64)
        lin = m * (200.0 / 3)
        log = 1000.0 * np.exp((np.log(6.4) / 27.0) * (m - 15.0))
        return np.where(m >= 15.0, log, lin)

    freqs = np.linspace(0, sr / 2, n_fft // 2 + 1)
    mels = MelToHz(np.linspace(HzToMel(fmin), HzToMel(fmax), n_mels + 2))
    fdiff = np.diff(mels)
    ramps = mels[:, None] - freqs[None, :]
    weights = np.zeros((n_mels, len(freqs)))
    for i in range(n_mels):
        lower = -ramps[i] / fdiff[i]
        upper = ramps[i + 2] / fdiff[i + 1]
        weights[i] = np.maximum(0, np.minimum(lower, upper))
    weights *= (2.0 / (mels[2:n_mels + 2] - mels[:n_mels]))[:, None]
    return weights.astype(np.float32)


class Encoder:
    def __init__(self, tensors, device):
        import torch
        self.torch = torch
        self.w = {k: v.to(device) for k, v in tensors.items()}
        self.device = device
        self.mel = torch.from_numpy(SlaneyMel(SR, 1024, 128, 0, 12000)).to(device)
        self.window = torch.hann_window(1024).to(device)

    def Conv(self, x, name, dilation=1, act=True):
        F = self.torch.nn.functional
        weight, bias = self.w[name + ".weight"], self.w[name + ".bias"]
        k = weight.shape[-1]
        pad = dilation * (k - 1) // 2
        if pad:
            x = F.pad(x, (pad, pad), mode="reflect")
        y = F.conv1d(x, weight, bias, dilation=dilation)
        return F.relu(y) if act else y

    def Mel(self, audio):
        torch = self.torch
        y = torch.from_numpy(audio).to(self.device)[None, None]
        p = (1024 - 256) // 2
        y = torch.nn.functional.pad(y, (p, p), mode="reflect")[:, 0]
        spec = torch.stft(y, 1024, hop_length=256, win_length=1024, window=self.window, center=False,
                          pad_mode="reflect", normalized=False, onesided=True, return_complex=True)
        spec = torch.sqrt(spec.real ** 2 + spec.imag ** 2 + 1e-9)
        return torch.log(torch.clamp(self.mel @ spec, min=1e-5))  # [1, 128, T]

    def Embed(self, audio):
        torch = self.torch
        F = torch.nn.functional
        with torch.no_grad():
            x = self.Mel(audio)
            x = self.Conv(x, "blocks.0.conv", 1)
            outs = []
            for i, dil in ((1, 2), (2, 3), (3, 4)):
                b = f"blocks.{i}."
                res = x
                h = self.Conv(x, b + "tdnn1.conv")
                chunks = torch.chunk(h, 8, dim=1)
                ys, prev = [chunks[0]], None
                for j in range(1, 8):
                    inp = chunks[j] if j == 1 else chunks[j] + prev
                    prev = self.Conv(inp, b + f"res2net_block.blocks.{j - 1}.conv", dil)
                    ys.append(prev)
                h = torch.cat(ys, dim=1)
                h = self.Conv(h, b + "tdnn2.conv")
                s = h.mean(dim=2, keepdim=True)
                s = torch.relu(F.conv1d(s, self.w[b + "se_block.conv1.weight"], self.w[b + "se_block.conv1.bias"]))
                s = torch.sigmoid(F.conv1d(s, self.w[b + "se_block.conv2.weight"], self.w[b + "se_block.conv2.bias"]))
                x = h * s + res
                outs.append(x)
            x = self.Conv(torch.cat(outs, dim=1), "mfa.conv")
            T = x.shape[-1]
            mean = x.mean(dim=2, keepdim=True)
            std = torch.sqrt(((x - mean) ** 2).mean(dim=2, keepdim=True).clamp(min=1e-12))
            ctx = torch.cat([x, mean.expand(-1, -1, T), std.expand(-1, -1, T)], dim=1)
            a = torch.tanh(self.Conv(ctx, "asp.tdnn.conv"))
            a = F.conv1d(a, self.w["asp.conv.weight"], self.w["asp.conv.bias"])
            a = torch.softmax(a, dim=2)
            m = (a * x).sum(dim=2)
            sd = torch.sqrt(((a * (x - m[:, :, None]) ** 2).sum(dim=2)).clamp(min=1e-12))
            pooled = torch.cat([m, sd], dim=1)[:, :, None]
            e = F.conv1d(pooled, self.w["fc.weight"], self.w["fc.bias"])[0, :, 0]
            e = e / e.norm()
            return e.cpu().numpy()


def Main():
    args = sys.argv[1:]
    out = None
    files = []
    i = 0
    while i < len(args):
        if args[i] == "--json":
            out = args[i + 1]; i += 2; continue
        if args[i] == "--list":
            files += [l.strip() for l in open(args[i + 1], encoding="utf8") if l.strip()]; i += 2; continue
        files.append(args[i]); i += 1
    try:
        import torch
    except Exception:
        print("torch unavailable", file=sys.stderr); sys.exit(3)
    weights = FindWeights()
    if not weights:
        print("Qwen3-TTS base weights not in the Hugging Face cache", file=sys.stderr); sys.exit(3)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    enc = Encoder(LoadSpeakerTensors(weights), device)
    result = {}
    for f in files:
        audio = Decode(f)
        if len(audio) < SR // 4:
            audio = np.pad(audio, (0, SR // 4 - len(audio)))
        result[f] = [round(float(v), 6) for v in enc.Embed(audio)]
    if out:
        with open(out, "w", encoding="utf8") as fh:
            json.dump(result, fh)
    else:
        names = list(result)
        M = np.array([result[n] for n in names])
        S = M @ M.T
        for a in range(len(names)):
            print(f"{os.path.basename(names[a])[:40]:40s}", " ".join(f"{S[a, b]:.2f}" for b in range(len(names))))


if __name__ == "__main__":
    Main()
