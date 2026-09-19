"""Align the existing, complete Seed Audio recordings; never generate or cut audio.
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

def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--model",required=True)
    parser.add_argument("--node",default="node")
    parser.add_argument("--output",required=True)
    parser.add_argument("--only",help="Comma-separated cue IDs; omit to align all cues")
    parser.add_argument("--groups",help="JSON mapping cue IDs to [start,end,firstLine,lastLineExclusive,language?] windows, each <=30 seconds")
    parser.add_argument("--emit",action="store_true",help="Rewrite Data_FirstLevelMissionVoiceAlignment.mjs when done")
    args=parser.parse_args()
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
