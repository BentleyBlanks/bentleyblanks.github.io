"""Two jobs share this file.

1) 2026-09-23 per-line dry takes (01–06): --lines jobs.json --result out.json
   Each job is {"file", "lang" ("zh"/"ja"), "text" (what was sent to TTS), "reference"?
   (text to score the transcript against; defaults to text)}. For every file it returns
   the free transcript, the character error rate against the reference, and a forced
   per-character alignment of the intended text (whisper cross-attention, like below).
   Script_SeedAudioVoiceKit.Transcribe drives this; the baker writes the per-character
   timings into Audio/FirstLevel/Data_FirstLevelLineTimings.json keyed by sha256.

2) Legacy whole-cue takes (07–18): align the existing, complete Seed Audio recordings;
   never generate or cut audio.
Requires faster-whisper. Source text is read through Node from the dialogue module
(MissionVoiceAlignmentCues gives the text that is actually spoken, so the Japanese
lines align against their kana rather than the Chinese subtitle).

  python Script_FirstLevelVoiceAlign.py --model <dir> --output _shots/L1Voice
         [--only A,B] [--groups windows.json] [--emit]

--groups maps a cue id to ordered windows [start, end, firstLine, lastLineExclusive]
with an optional fifth element naming the language of that window ("zh" / "ja").
Every window must be <=30 s. Without a language the window takes the language of
its lines when they agree, otherwise Chinese.

--emit rewrites Data_FirstLevelMissionVoiceAlignment.mjs from the accumulated JSON
(story cues only; the guide cues keep coming from GUIDE_VOICE_ALIGNMENT), so the
60-odd intervals never have to be copied by hand.
"""
import argparse, hashlib, json, pathlib, subprocess
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio, pad_or_trim
from faster_whisper.tokenizer import Tokenizer

MODEL_NOTE = "faster-whisper medium CPU int8"

def ReadCues(node, dialogue):
    result=subprocess.run([node,"--input-type=module","-e",
        "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(m.MissionVoiceAlignmentCues()));",
        dialogue.as_uri()],check=True,capture_output=True,encoding="utf-8")
    return json.loads(result.stdout)

def Emit(root, all_cues, cues):
    order=[cue["id"] for cue in cues if not cue["guidance"]]
    body=["import { GUIDE_VOICE_ALIGNMENT } from \"./Data_FirstLevelGuideVoiceAlignment.mjs\";",
        "// Complete Seed Audio takes, source-relative forced alignment; model recorded per cue.",
        "// Audio and script hashes prevent reuse after a dialogue change.",
        "// 由 Script_FirstLevelVoiceAlign.py --emit 生成，不要手改。",
        "export const MISSION_VOICE_ALIGNMENT = Object.freeze({",
        "  ...GUIDE_VOICE_ALIGNMENT,"]
    written=0
    for cue_id in order:
        entry=all_cues.get(cue_id)
        if not entry: continue
        row={"sha256":entry["sha256"],"scriptSha256":entry["scriptSha256"],
            "groupsSha256":entry["groupsSha256"],"model":MODEL_NOTE,
            "lines":entry["lines"]}
        if entry.get("note"): row["note"]=entry["note"]
        body.append("  "+json.dumps(cue_id,ensure_ascii=False)+": "+json.dumps(row,ensure_ascii=False)+",")
        written+=1
    body.append("});")
    (root/"Data_FirstLevelMissionVoiceAlignment.mjs").write_text("\n".join(body)+"\n",encoding="utf-8")
    print("emitted",written,"story cue alignments",flush=True)

PUNCT=set("，。！？、；：“”‘’（）《》…—-,.!?;:'\"()[] \t\n「」『』・～~")

def Normalize(text):
    # 片假名折成平假名（whisper 常把「ぐずぐず」写成「グズグズ」），标点与空白去掉。
    return "".join(chr(ord(c)-0x60) if "ァ"<=c<="ヶ" else c for c in text if c not in PUNCT)

def Cer(hyp, ref):
    a,b=Normalize(hyp),Normalize(ref)
    if not b: return 0.0 if not a else 1.0
    prev=list(range(len(b)+1))
    for i,ca in enumerate(a,1):
        cur=[i]+[0]*len(b)
        for j,cb in enumerate(b,1):
            cur[j]=min(prev[j]+1,cur[j-1]+1,prev[j-1]+(ca!=cb))
        prev=cur
    return prev[-1]/len(b)

def DefaultModel():
    root=pathlib.Path.home()/".cache/huggingface/hub/models--Systran--faster-whisper-medium/snapshots"
    hits=sorted(root.glob("*/model.bin"))
    if not hits: raise SystemExit("faster-whisper medium not in the Hugging Face cache; pass --model")
    return str(hits[0].parent)

def Lines(model, jobs_path, result_path):
    jobs=json.loads(pathlib.Path(jobs_path).read_text(encoding="utf-8"))
    out={}
    for job in jobs:
        lang=job.get("lang","zh")
        samples=decode_audio(job["file"],sampling_rate=16000)
        # 中文给一句简体提示，否则 medium 常吐繁体、字错率被虚高。
        prompt=job.get("initialPrompt") or ("以下是简体中文的句子。" if lang=="zh" else None)
        # 一句台词只有几秒：只用温度 0、束宽 2、按字数封顶输出长度。温度回退 + 束宽 5 会在
        # 短句上反复生成到 448 个 token 的上限（实测 75 条 take 转写跑了 30 分钟还没完）。
        limit=max(24,len(Normalize(job.get("text","")))*3+16)
        segments,_=model.transcribe(samples,language=lang,beam_size=2,vad_filter=False,temperature=0.0,
            condition_on_previous_text=False,without_timestamps=True,initial_prompt=prompt,max_new_tokens=limit)
        text="".join(seg.text for seg in segments).strip()
        reference=job.get("reference") or job["text"]
        row={"text":text,"cer":round(Cer(text,reference),4)}
        # Forced alignment of the intended text: one entry per spoken character.
        try:
            tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task="transcribe",language=lang)
            audio=samples[:16000*30]
            encoded=model.encode(pad_or_trim(model.feature_extractor(audio)))
            frame_count=min(3000,int(np.ceil(len(audio)/160)))
            target=Normalize(job["text"])
            tokens=tokenizer.encode(target)
            words=model.find_alignment(tokenizer,[tokens],encoded,frame_count)[0]
            chars=[];prob=[]
            for w in words:
                piece=Normalize(w["word"])
                if not piece: continue
                span=(w["end"]-w["start"])/len(piece)
                for k,c in enumerate(piece):
                    chars.append([c,round(w["start"]+k*span,3),round(w["start"]+(k+1)*span,3)])
                prob.append(float(w["probability"]))
            row["chars"]=chars
            row["alignProbability"]=round(sum(prob)/len(prob),4) if prob else 0
        except Exception as error:  # noqa: BLE001
            row["alignError"]=str(error)[:200]
        out[job["file"]]=row
        print("line",pathlib.Path(job["file"]).name,row["cer"],text,flush=True)
    pathlib.Path(result_path).write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding="utf-8")

def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--model")
    parser.add_argument("--lines",help="JSON list of per-line jobs (see module doc)")
    parser.add_argument("--result",help="Where --lines writes its JSON")
    parser.add_argument("--node",default="node")
    parser.add_argument("--output")
    parser.add_argument("--only",help="Comma-separated cue IDs; omit to align all cues")
    parser.add_argument("--groups",help="JSON mapping cue IDs to [start,end,firstLine,lastLineExclusive,language?] windows, each <=30 seconds")
    parser.add_argument("--emit",action="store_true",help="Rewrite Data_FirstLevelMissionVoiceAlignment.mjs when done")
    args=parser.parse_args()
    if args.lines:
        model=WhisperModel(args.model or DefaultModel(),device="cpu",compute_type="int8",cpu_threads=8,local_files_only=True)
        Lines(model,args.lines,args.result)
        return
    if not args.model: args.model=DefaultModel()
    root=pathlib.Path(__file__).resolve().parent
    dialogue=root/"Data_FirstLevelMissionDialogue.mjs"
    every=ReadCues(args.node,dialogue)
    cues=every
    if args.only:
        selected=set(args.only.split(","))
        if selected-set(cue["id"] for cue in cues): raise ValueError("Unknown cue ID")
        cues=[cue for cue in cues if cue["id"] in selected]
    authored=json.loads(pathlib.Path(args.groups).read_text(encoding="utf-8")) if args.groups else {}
    output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
    existing=output/"Data_FirstLevelVoiceAlignment.json"
    all_cues=json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else {}
    model=WhisperModel(args.model,device="cpu",compute_type="int8",cpu_threads=8,local_files_only=True)
    for cue in cues:
        path=root/"Audio/FirstLevel"/cue["file"]
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        script_digest=hashlib.sha256(cue["scriptJson"].encode()).hexdigest()
        cached=all_cues.get(cue["id"],{})
        samples=decode_audio(str(path),sampling_rate=16000)
        seconds=len(samples)/16000
        groups=authored.get(cue["id"],[[0,seconds,0,len(cue["lines"])]])
        next_line=0; previous_end=0; normalized=[]
        for group in groups:
            start,end,first,last=group[0],group[1],group[2],group[3]
            if not (0<=start<end<=seconds+.02 and end-start<=30 and start>=previous_end
                    and first==next_line and first<last<=len(cue["lines"])):
                raise ValueError(cue["id"]+" requires ordered <=30s --groups covering every line")
            langs={line["lang"] for line in cue["lines"][first:last]}
            language=group[4] if len(group)>4 else (langs.pop() if len(langs)==1 else "zh")
            if len(langs)>1 and len(group)<=4:
                print("REVIEW",cue["id"],"mixed languages in one window; aligning as zh",flush=True)
            normalized.append((start,end,first,last,language))
            next_line=last; previous_end=end
        if next_line!=len(cue["lines"]): raise ValueError("Incomplete alignment groups")
        groups_digest=hashlib.sha256(json.dumps(normalized).encode()).hexdigest()
        if (cached.get("sha256")==digest and cached.get("scriptSha256")==script_digest
                and cached.get("groupsSha256")==groups_digest): continue
        ranges=[]; evidence=[]; collapsed=[]
        for start,end,first,last,language in normalized:
            tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task="transcribe",language=language)
            audio=samples[round(start*16000):round(end*16000)]
            features=model.feature_extractor(audio)
            frame_count=min(3000,int(np.ceil(len(audio)/160)))
            encoded=model.encode(pad_or_trim(features))
            per_line=[tokenizer.encode(line["text"]) for line in cue["lines"][first:last]]
            tokens=[t for row in per_line for t in row]
            words=model.find_alignment(tokenizer,[tokens],encoded,frame_count)[0]
            cursor=0;word_index=0
            for line_index,line_tokens in enumerate(per_line,first):
                target=cursor+len(line_tokens);selected=[]
                while word_index<len(words) and cursor<target:
                    word=words[word_index];selected.append(word)
                    cursor+=len(word["tokens"]);word_index+=1
                spoken=[w for w in selected if any(c.isalnum() for c in w["word"])] or selected
                if not spoken: raise ValueError(cue["id"]+" has no aligned words")
                line_start=start+spoken[0]["start"]
                line_end=min(end,start+spoken[-1]["end"])
                if line_end<=line_start:
                    print("REVIEW",cue["id"],line_index,"collapsed",line_start,flush=True)
                    collapsed.append(line_index)
                ranges.append([round(line_start,3),round(line_end,3)])
                evidence.append({"line":line_index,"language":language,"words":[
                    {"text":w["word"],"start":round(start+w["start"],3),
                     "end":round(start+w["end"],3),"probability":round(float(w["probability"]),4)}
                     for w in selected]})
        # 一声「嗯」这种只有一个音的行，逐词对齐会塌成零长度，字幕等于不显示。
        # 撑到 0.6 秒，但绝不越过下一句的起点（区间必须单调不重叠）。
        for line_index in collapsed:
            limit=ranges[line_index+1][0] if line_index+1<len(ranges) else seconds
            ranges[line_index][1]=round(min(ranges[line_index][0]+0.6,limit),3)
        row={"sha256":digest,"scriptSha256":script_digest,"groupsSha256":groups_digest,"lines":ranges}
        if collapsed:
            row["note"]=("forced alignment collapsed line(s) "+",".join(str(i) for i in collapsed)
                +"; widened up to 0.6s without crossing the next line, so "
                +",".join("%d=%.2fs"%(i,ranges[i][1]-ranges[i][0]) for i in collapsed))
        all_cues[cue["id"]]=row
        (output/("Data_Aligned"+cue["id"]+".json")).write_text(
            json.dumps(evidence,ensure_ascii=False,indent=2),encoding="utf-8")
        (output/"Data_FirstLevelVoiceAlignment.json").write_text(
            json.dumps(all_cues,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(cue["id"],ranges,flush=True)
    if args.emit: Emit(root,all_cues,every)
if __name__=="__main__":Main()
