"""Compose locally rendered inspection videos and an offline playback page."""
from pathlib import Path
import json,subprocess,shutil
from PIL import Image,ImageDraw,ImageFont
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905';folder=runtime/'PreviewFrames';output=runtime/'Deliverables'
fontPath=Path('C:/Windows/Fonts/msyh.ttc');font=ImageFont.truetype(str(fontPath),23);small=ImageFont.truetype(str(fontPath),18)
ffmpeg=shutil.which('ffmpeg')
groups=[('CrouchAdvance','低姿持枪推进 · 完整左右循环', [('RifleCrouchAdvanceRootMotion',105)]*2),
 ('KneelSequence','站立 → 单膝跪地 → 稳定保持 → 起身',[('StandToKneel',53),('KneelHold',26),('KneelHold',26),('KneelToStand',48)]),
 ('GrenadeThrow','右手过肩投掷 · 引臂、释放与收势',[('GrenadeThrow',128)])]
videoPaths=[];posterFrames=[]
for key,label,segments in groups:
 target=output/f'Preview_{key}.mp4';videoPaths.append(target)
 command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','1024x1080','-r','30','-i','-','-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
 process=subprocess.Popen(command,stdin=subprocess.PIPE)
 for clip,count in segments:
  for index in range(count):
   canvas=Image.new('RGB',(1024,1080),(20,27,32));draw=ImageDraw.Draw(canvas);draw.text((24,13),label,font=font,fill=(241,235,214))
   for y,view in [(56,'ThreeQuarter'),(568,'Side')]:
    for x,faction in [(0,'Nra'),(512,'Ija')]:
     path=folder/f'Texture_{faction}_{clip}_{view}_{index:04d}.png';canvas.paste(Image.open(path).convert('RGB'),(x,y))
     draw.rectangle((x+10,y+10,x+155,y+42),fill=(25,32,36));draw.text((x+18,y+14),('国军' if faction=='Nra' else '日军')+' · '+('斜前方' if view=='ThreeQuarter' else '侧面'),font=small,fill='white')
   process.stdin.write(canvas.tobytes())
   if index==min(count-1,40) and clip in ['RifleCrouchAdvanceRootMotion','StandToKneel','GrenadeThrow']:
    canvas.save(output/f'Texture_{key}Preview.jpg',quality=93)
 process.stdin.close();assert process.wait()==0
 print('ENCODED',target.name,flush=True)
concat=runtime/'Data_PreviewConcat.txt';concat.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in videoPaths),encoding='utf-8')
combined=output/'Preview_NraIjaInfantryActions.mp4'
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(combined)],check=True)
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(combined),'-vf','setpts=2*PTS','-r','30','-an','-c:v','libx264','-preset','medium','-crf','20','-movflags','+faststart',str(output/'Preview_NraIjaInfantryActionsHalfSpeed.mp4')],check=True)
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>国军与日军步兵动作</title><style>
body{margin:0;background:#151d22;color:#efe9d6;font:16px system-ui,"Microsoft YaHei"}main{max-width:1180px;margin:36px auto;padding:0 24px}h1{font-size:30px;margin-bottom:10px}p{color:#b9c5cc;line-height:1.7}button,a{background:#344850;color:#fff;border:1px solid #58727e;border-radius:8px;padding:10px 18px;text-decoration:none;cursor:pointer;margin:4px}button[aria-pressed=true]{background:#b49755;color:#172026}video{display:block;width:100%;max-height:76vh;background:#111;margin:18px 0;border-radius:12px}nav{display:flex;flex-wrap:wrap}small{color:#b9c5cc}</style><main><h1>国军与日军 · 步兵动作</h1><p>低姿持枪推进、站立转跪地、跪姿保持、跪姿起身、右手过肩投掷。每种动作均按对应原骨架制作。<br>Seedance 2.5 → GVHMR → Blender 接触与握枪修正。本地非商业研究验证。</p><nav><button data-src="Preview_CrouchAdvance.mp4">低姿推进</button><button data-src="Preview_KneelSequence.mp4">下跪与起身</button><button data-src="Preview_GrenadeThrow.mp4">过肩投掷</button><button data-src="Preview_NraIjaInfantryActions.mp4">全部预览</button></nav><video controls loop playsinline src="Preview_CrouchAdvance.mp4" poster="Texture_CrouchAdvancePreview.jpg"></video><nav><button data-speed="1">正常速度</button><button data-speed="0.5">半速检查</button><button id="step">逐帧 +1/30 秒</button><a href="Scene_NraIjaInfantryActions.blend">可编辑 Blender 工程</a><a href="Data_AnimationCatalog.json">动画文件清单</a></nav><p>工程：运行附带的 Open_InfantryActions.cmd，在右侧 Infantry 面板选择阵营和动作。<br>投掷释放标记为动画第 130 帧（2.15 秒）。视频中的飞行道具仅供观察释放方向；游戏事件尚未接入。</p><small>原骨架 53 骨和绑定保持不变。低姿推进提供原地与根位移两种 GLB。三段新参考视频共使用 360 点；已有跑步成果独立保留。</small></main><script>
const v=document.querySelector('video');let playbackSpeed=1;v.addEventListener('loadedmetadata',()=>{v.playbackRate=playbackSpeed});document.querySelectorAll('[data-src]').forEach(b=>b.onclick=()=>{v.src=b.dataset.src;v.play()});document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{playbackSpeed=Number(b.dataset.speed);v.playbackRate=playbackSpeed});document.querySelector('#step').onclick=()=>{v.pause();v.currentTime+=1/30};</script></html>'''
(output/'Preview_InfantryActions.html').write_text(html,encoding='utf-8')
print('PREVIEW_PACKAGE_COMPLETE')
