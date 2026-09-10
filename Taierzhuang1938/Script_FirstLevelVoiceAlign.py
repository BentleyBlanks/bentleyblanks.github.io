"""Align the existing, complete Seed Audio recordings; never generate or cut audio.
Requires faster-whisper. Source text is read through Node from the dialogue module.
Outputs source-relative subtitle timings plus evidence; review before accepting."""
import argparse, hashlib, json, pathlib, subprocess
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio, pad_or_trim
from faster_whisper.tokenizer import Tokenizer

def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--model",required=True)
    parser.add_argument("--node",default="node")
    parser.add_argument("--output",required=True)
    parser.add_argument("--only",help="Comma-separated cue IDs; omit to align all cues")
    parser.add_argument("--groups",help="JSON mapping cue IDs to [start,end,firstLine,lastLineExclusive] windows, each <=30 seconds")
    args=parser.parse_args()
    root=pathlib.Path(__file__).resolve().parent
    dialogue=root/"Data_FirstLevelMissionDialogue.mjs"
    result=subprocess.run([args.node,"--input-type=module","-e",
        "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(m.MISSION_DIALOGUE));",
        dialogue.as_uri()],check=True,capture_output=True,encoding="utf-8")
    cues=json.loads(result.stdout)
    if args.only:
        selected=set(args.only.split(","))
        if selected-set(cue["id"] for cue in cues): raise ValueError("Unknown cue ID")
        cues=[cue for cue in cues if cue["id"] in selected]
    authored=json.loads(pathlib.Path(args.groups).read_text(encoding="utf-8")) if args.groups else {}
    model=WhisperModel(args.model,device="cpu",compute_type="int8",cpu_threads=8,local_files_only=True)
    output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
    existing=output/"Data_FirstLevelVoiceAlignment.json"
    all_cues=json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else {}
    for cue in cues:
        path=root/"Audio/FirstLevel"/cue["file"]
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        script_digest=hashlib.sha256(json.dumps(cue["lines"],ensure_ascii=False).encode()).hexdigest()
        cached=all_cues.get(cue["id"],{})
        samples=decode_audio(str(path),sampling_rate=16000)
        seconds=len(samples)/16000
        tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task="transcribe",
            language="ja" if cue.get("subtitles")==False else "zh")
        groups=authored.get(cue["id"],[(0,seconds,0,len(cue["lines"]))])
        next_line=0; previous_end=0
        for start,end,first,last in groups:
            if not (0<=start<end<=seconds+.02 and end-start<=30 and start>=previous_end
                    and first==next_line and first<last<=len(cue["lines"])):
                raise ValueError(cue["id"]+" requires ordered <=30s --groups covering every line")
            next_line=last; previous_end=end
        if next_line!=len(cue["lines"]): raise ValueError("Incomplete alignment groups")
        groups_digest=hashlib.sha256(json.dumps(groups).encode()).hexdigest()
        if (cached.get("sha256")==digest and cached.get("scriptSha256")==script_digest
                and cached.get("groupsSha256")==groups_digest): continue
        ranges=[]; evidence=[]
        for start,end,first,last in groups:
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
                if line_end<=line_start: print("REVIEW",cue["id"],line_index,"collapsed",line_start,flush=True)
                ranges.append([round(line_start,3),round(line_end,3)])
                evidence.append({"line":line_index,"words":[
                    {"text":w["word"],"start":round(start+w["start"],3),
                     "end":round(start+w["end"],3),"probability":round(float(w["probability"]),4)}
                     for w in selected]})
        all_cues[cue["id"]]={"sha256":digest,"scriptSha256":script_digest,"groupsSha256":groups_digest,"lines":ranges}
        (output/("Data_Aligned"+cue["id"]+".json")).write_text(
            json.dumps(evidence,ensure_ascii=False,indent=2),encoding="utf-8")
        (output/"Data_FirstLevelVoiceAlignment.json").write_text(
            json.dumps(all_cues,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(cue["id"],ranges,flush=True)
if __name__=="__main__":Main()
