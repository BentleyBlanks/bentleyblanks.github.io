"""Submit/retrieve the three explicitly scoped Seedance research references."""
from pathlib import Path
import argparse, json, shutil, subprocess

runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
source=runtime/'Sources'; source.mkdir(parents=True,exist_ok=True)
prompts={
 'RifleCrouchAdvance': '游戏角色动作捕捉研究，写实真人单人全身体育录像。一个成年男性演员穿合身的1930年代土黄色步兵制服、长裤、绑腿和布军帽，双手稳稳端着木制长步枪道具，枪托在右肩前，右手握枪柄，左手托前护木，枪口始终朝画面右方。全程保持低姿屈膝，骨盆高度约为站立时的三分之二，躯干略前倾，头看向前方，以连续、小幅、自然交替的低姿步伐向画面右方缓慢前进，不站直、不跪下、不奔跑，不拖脚，每一步清晰抬脚再落地，至少三个完整左右步周期。正常速度，真实重量转移，步枪在双手间保持刚性稳定。镜头平稳横向跟随，观察方向固定为近侧面略带15度正面，人物从头顶到两脚始终完整入画。浅灰摄影棚、平整地面、明亮柔光，高快门无运动模糊，单人单镜头，无剪辑无变焦无字幕，无开火无爆炸。',
 'RifleKneelTransition': '游戏动画动作捕捉研究，写实真人全身固定机位录像。只有一个成年男性演员，穿合身的1930年代土黄色步兵制服、长裤、绑腿、布军帽，面朝画面右方，双手端着一支木制长步枪道具，枪托在右肩前，左手稳托前护木，枪口朝右。完整连续表演一次站立到右膝跪地再起身：第0到0.5秒站稳；0.5到2秒左脚小步在前，身体自然下降，右膝轻轻落到地面，左脚完全着地，左膝约90度，保持躯干自然直立稍前倾；2到3.3秒稳定保持单膝跪姿据枪；3.3到5秒左脚蹬地，自然站起，收回右脚；5到6秒站稳收势。两只手全程稳定持枪，骨盆有真实下沉和上升，膝盖弯曲有支撑感，没有腾空，不用手撑地，不突然跳到另一个姿势。人物从头顶到两脚完整可见，近侧面略带20度正面。浅灰摄影棚和平整地面，真实正常速度，高快门清晰，单镜头无剪辑无变焦无其他人，无开火无爆炸无字幕。',
 'GrenadeThrow': '历史游戏角色动作捕捉参考，写实成年男性演员全身固定机位录像，无战斗场景。演员穿合身的1930年代步兵制服、长裤、绑腿、布军帽，一支木托长步枪用背带稳固斜背在背上，双臂自由。人物朝画面右方，右手拿一枚小型木制训练投掷道具。连续六秒完成一次自然的右手过肩投掷：先双脚站稳，道具在右侧腰前；约第1秒右臂自然向后上方引摆，躯干小幅转动，重心移到后脚；第2到3秒左脚向前迈一小步稳定落地，右臂顺势向前过肩投出道具，右肩和肘腕连贯发力，左臂自然平衡；随后右臂向前下方随挥，身体自然前倾并回正，两脚恢复稳定，最后一秒保持收势。一次投掷，不重复甩臂，不跳跃，不奔跑，道具飞出画面后不再出现。正常真实速度，头、躯干、手臂与双脚有自然协调，全身完整入画，近侧面略带20度正面。灰色摄影棚、平整地面、均匀柔光、高快门，无剪辑无变焦无其他人，无爆炸无烟雾无字幕。'
}
parser=argparse.ArgumentParser(); parser.add_argument('mode',choices=['submit','poll']); args=parser.parse_args()
cli=shutil.which('dreamina'); assert cli
for name,prompt in prompts.items():
    record=source/f'Data_{name}Generation.json'
    if args.mode=='submit':
        if record.exists():
            previous=json.loads(record.read_text(encoding='utf-8'))
            if previous.get('submit_id'): print(name,'already submitted',previous['submit_id'],flush=True); continue
            raise RuntimeError(f'Inspect existing ambiguous submission before retry: {record}')
        command=[cli,'text2video','--prompt='+prompt,'--model_version=seedance2.5','--video_resolution=720p','--ratio=16:9','--duration=6','--poll=0']
        record.write_text(json.dumps({'state':'submission_started','prompt':prompt,'model':'seedance2.5','durationSeconds':6},ensure_ascii=False,indent=2),encoding='utf-8')
        run=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',timeout=120)
        (source/f'Data_{name}SubmitLog.txt').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
        result=json.loads(run.stdout)
        record.write_text(json.dumps({'prompt':prompt,'model':'seedance2.5','durationSeconds':6,**result},ensure_ascii=False,indent=2),encoding='utf-8')
        assert result.get('submit_id') and result.get('gen_status') in ['querying','success'],result
        print(name,result['submit_id'],result['gen_status'],result.get('commerce_info'),flush=True)
    else:
        if not record.exists(): continue
        previous=json.loads(record.read_text(encoding='utf-8')); submit=previous['submit_id']
        target=source/name; target.mkdir(exist_ok=True)
        run=subprocess.run([cli,'query_result','--submit_id='+submit,'--download_dir='+str(target)],capture_output=True,text=True,encoding='utf-8',timeout=120)
        (source/f'Data_{name}QueryLog.txt').write_text(run.stdout+'\n'+run.stderr,encoding='utf-8')
        try: result=json.loads(run.stdout)
        except json.JSONDecodeError: print(name,run.stdout[-1500:],flush=True); continue
        (source/f'Data_{name}Result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(name,result.get('gen_status'),result.get('fail_reason'),[str(p) for p in target.glob('*.mp4')],flush=True)
