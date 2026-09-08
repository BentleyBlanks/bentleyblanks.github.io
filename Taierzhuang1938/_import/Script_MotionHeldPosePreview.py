"""Extend the private three-pane viewer for explicitly authored held-source poses.

The original player module is retained. Only the new module and local index
script reference are written; video, raw arrays and historical model data stay intact.
"""
from pathlib import Path
import argparse, hashlib, json, re

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
preview=args.root.resolve()/'Preview'
source=preview/'Script_SourceReview.mjs'
text=source.read_text(encoding='utf-8')
def Replace(before,after):
    global text
    assert text.count(before)==1, before
    text=text.replace(before,after)

Replace('function SyncPausedVideo(){',
 'function HeldPose(){return Number.isFinite(review?.sourcePoseSeconds);}\n'
 'function SourceTime(){return HeldPose()?review.sourcePoseSeconds:range?range[0]+phase*(range[1]-range[0]):0;}\n'
 'function AdvanceModel(delta){phase+=delta*+$("speed").value/(model.duration||1);if(phase>1){if($("loop").checked){cycles+=Math.floor(phase);phase%=1;}else{phase=1;SetPlaying(false);}}}\n'
 'function SyncPausedVideo(){')
Replace('const target=range[0]+phase*(range[1]-range[0]);','const target=SourceTime();')
Replace("if(range[0]<0||range[1]>video.duration+.1||range[1]<=range[0])", "if(range[0]<0||range[1]>video.duration+.1||range[1]<=range[0]||(HeldPose()&&(review.sourcePoseSeconds<range[0]||review.sourcePoseSeconds>range[1])))")
Replace('if(range&&!video.seeking&&video.readyState>=2)phase=', 'if(range&&!HeldPose()&&!video.seeking&&video.readyState>=2)phase=')
Replace("const span=range?range[1]-range[0]:(model.duration||1),fps=review?.recoveryFps||60;", "const span=range&&!HeldPose()?range[1]-range[0]:(model.duration||1),fps=HeldPose()?60:review?.recoveryFps||60;")
Replace('if(range&&video.readyState>=2){', 'if(HeldPose()){video.pause();SyncPausedVideo();if(playing)AdvanceModel(delta);}\n  else if(range&&video.readyState>=2){')
Replace('const sourceTime=range?range[0]+phase*(range[1]-range[0]):0;', 'const sourceTime=SourceTime();')
Replace("if(range)$('sourceMeta').textContent=`原片 ${sourceTime.toFixed(2)} s · 选段 ${range[0].toFixed(2)}–${range[1].toFixed(2)} s`;", "if(range)$('sourceMeta').textContent=HeldPose()?`固定源帧 ${sourceTime.toFixed(2)} s · 模型动作为后期制作`:`原片 ${sourceTime.toFixed(2)} s · 选段 ${range[0].toFixed(2)}–${range[1].toFixed(2)} s`;")

module=preview/'Script_SourceReviewHeldPose.mjs';module.write_text(text,encoding='utf-8')
digest=hashlib.sha256(module.read_bytes()).hexdigest()
index=preview/'index.html';html=index.read_text(encoding='utf-8')
html,count=re.subn(r'Script_SourceReview(?:HeldPose)?\.mjs\?v=[^"\s]+',f'Script_SourceReviewHeldPose.mjs?v={digest[:12]}',html)
assert count==1
index.write_text(html,encoding='utf-8')
(preview/'Data_HeldPosePlayer.json').write_text(json.dumps(dict(source=source.name,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
 module=module.name,moduleSha256=digest,contract='sourcePoseSeconds holds the original video and unmodified raw frame; model time advances independently for explicitly authored hold animation'),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(module=module.name,sha256=digest)))
