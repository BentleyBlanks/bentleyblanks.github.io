"""Build a private live FL01-FL48 source-production dashboard, never a Pages page."""
from pathlib import Path
import argparse
import json
import re


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve()
    folder=Path(__file__).resolve().parent
    requests=json.loads((folder/'Data_FirstLevelSourceRequests.json').read_text(encoding='utf-8'))
    requirements=(folder.parent/'docs/Data_FirstLevelMissionAnimationRequirements.md').read_text(encoding='utf-8')
    labels={match[1]:match[2] for line in requirements.splitlines() if (match:=re.match(r'^\| (FL\d+)／[ABC] \| (.*?) \|',line))}
    out=root/'Preview/FirstLevelSourceBatchV1'
    out.mkdir(parents=True,exist_ok=True)
    status=json.loads((folder.parent/'docs/Data_FirstLevelMissionAnimationStatus.json').read_text(encoding='utf-8'))
    assert len(status['requirements'])==48
    (out/'Data_MissionStatus.json').write_text(json.dumps(status,ensure_ascii=False),encoding='utf-8')
    (out/'Data_Labels.json').write_text(json.dumps(dict(labels=labels,requests=requests),ensure_ascii=False),encoding='utf-8')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第一关 · 48 项素材制作</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#e0e5dd;background:#111a20}*{box-sizing:border-box}body{margin:0;padding:28px}h1{font-size:26px;margin:0 0 8px}p{color:#adbbb9;line-height:1.65}a{color:#cddd9e}button,input{font:inherit}button{background:#223239;border:1px solid #425253;border-radius:6px;padding:8px 11px;color:#e0e5dd;cursor:pointer}button:hover{border-color:#cddd9e}.metrics{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.metric{min-width:160px;padding:16px;background:#1b292f;border-top:2px solid #9eaf82}.metric b{display:block;font-size:28px;margin-top:6px}.layout{display:grid;grid-template-columns:minmax(560px,1.2fr) minmax(430px,1fr);gap:22px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:12px 9px;text-align:left;border-bottom:1px solid #33434a}th{position:sticky;top:0;background:#18262c}tbody tr:hover,tbody tr.selected{background:#263b3e}td:first-child{color:#cddd9e;font-weight:700;white-space:nowrap}.left{max-height:70vh;overflow:auto}.detail{padding:20px;background:#19272e;border:1px solid #33444a;border-radius:8px}.sources{display:flex;gap:8px;flex-wrap:wrap}.source{display:block;text-align:left;width:100%;margin:5px 0}.source span{display:block;color:#abb9b7;font-size:12px;margin-top:3px}.source.ok{border-color:#839e65}.source.active{border-color:#cfb87b}video{display:block;width:100%;max-height:340px;background:#10161a;margin:14px 0}#note{font-size:13px}#refresh{font-size:12px;color:#94a6a6}.toolbar{display:flex;gap:12px;margin:12px 0}input{padding:8px;background:#19272e;color:#eee;border:1px solid #455;border-radius:5px;flex:1}@media(max-width:1000px){body{padding:16px}.layout{grid-template-columns:1fr}.left{max-height:45vh}}
[hidden]{display:none!important}
</style>
<h1>第一关 · 48 项素材制作</h1><p>只用已有视频、恢复缓存和游戏动作，不再生成或补拍视频。缺失姿态、手指和道具接触继续后期制作；来源覆盖不等于动作已接入。</p>
<div id="metrics" class="metrics"></div><div class="toolbar"><input id="search" aria-label="筛选需求" placeholder="筛选 FL ID、角色或动作"><button id="reload">刷新</button></div><div id="refresh"></div>
<div class="layout"><div class="left"><table><thead><tr><th>需求</th><th>动作／角色</th><th>新片成功</th><th>生成中</th><th>复用条目</th><th>本批接入</th></tr></thead><tbody id="rows"></tbody></table></div><div class="detail"><h2 id="title">选择需求</h2><p id="runtime"></p><div id="sources" class="sources"></div><video id="video" controls playsinline preload="metadata" hidden></video><p id="note"></p><div id="links"></div></div></div>
<script type="module">
const $=id=>document.getElementById(id),labels=await(await fetch('./Data_Labels.json')).json(),requests=new Map(labels.requests.map(r=>[r.id,r]));
const missionStatus=await(await fetch('./Data_MissionStatus.json',{cache:'no-store'})).json();
const statusLabels={unsubmitted:'待提交',querying:'生成中',success:'已生成 · 待验片',waiting_for_credit:'等待积分',fail:'服务生成失败',uncertain_submission:'原任务待对账',success_download_missing:'生成成功 · 下载待核实'};
let plan,batch,states,inspection={sources:[]},integration=null,integrationFile='Data_GameIntegration.json',reviews=new Map(),selected='FL01',selectedSource=null;
function Element(tag,text,parent){const e=document.createElement(tag);e.textContent=text;if(parent)parent.append(e);return e}
function Link(text,href,parent){const a=Element('a',text,parent);a.href=href;a.target='_blank';a.rel='noopener';return a}
function ShowSource(name){const s=states.get(name),request=requests.get(name),review=reviews.get(name)?.assessment;selectedSource=name;const video=$('video');video.pause();video.hidden=true;video.removeAttribute('src');$('links').replaceChildren();
 if(s?.status==='success'&&s.files?.length){const filename=s.files[0].replaceAll('\\\\','/').split('/').at(-1);const base='../../Video/Sources/FirstLevelV1/'+encodeURIComponent(name)+'/';video.src=base+encodeURIComponent(filename);video.poster=base+'Texture_SourceFirstFrame.jpg';video.hidden=false;}
 $('note').textContent=(review?.retakeRequired?'初筛未通过 · 需补拍。':review?'已初筛 · 待逐帧复核。':(statusLabels[s?.status]||'待提交')+'。')+(review?((review.observed||'')+' '+(review.limitations||review.cameraLimitation||'')+'。'):'')+(s?.failReason?'服务原因：'+s.failReason+'。':'')+(request?.prompt||'');
 if(review){Link('初筛证据','../../'+(review.evidence||reviews.get(name).contactSheet),$('links'));Element('span',' · ',$('links'));}
 const dense=reviews.get(name)?.denseAssessment,retarget=reviews.get(name)?.retargetAssessment;
 if(dense){$('note').textContent=(dense.keypointsSha256?'密集抽帧与二维追踪已审阅；三维与接触状态见下方记录。':'密集抽帧已审阅；二维追踪尚未验收。')+dense.observed+' '+(retarget?.observed||'')+' 原提示词：'+(request?.prompt||'');Link('密集审阅记录','../../Video/Sources/FirstLevelV1/'+name+'/DenseReview/Data_VisualAssessment.json',$('links'));Element('span',' · ',$('links'));}
 if(retarget&&!dense)$('note').textContent=retarget.observed+' 原提示词：'+(request?.prompt||'');
 Link('该原片收据','../../Video/Sources/FirstLevelV1/'+name+'/Data_GenerationSubmit.json',$('links'));
 const candidate=reviews.get(name)?.retargetCandidate;if(candidate){Element('span',' · ',$('links'));Link('原片／原始骨骼／原模型三栏 · '+candidate.status,'../index.html?action='+encodeURIComponent(candidate.previewId),$('links'));}
 for(const h of reviews.get(name)?.retargetHistory||[]){Element('span',' · ',$('links'));Link((h.variantId===candidate?.variantId?'当前审阅 · ':'历史审阅 · ')+h.variantId,'../../'+h.path,$('links'));}
}
function Show(rid){selected=rid;const row=plan.requirements.find(r=>r.requirementId===rid);$('title').textContent=rid+' '+labels.labels[rid];$('sources').replaceChildren();
 $('runtime').replaceChildren();const scope=integration?.requirementScopes?.[rid];Element('span',scope?(integration.validationPending?'已启用 · 关卡复验中：':'部分接入：')+scope+'。':'本批新素材尚未接入；既有动作见复用条目。',$('runtime'));if(scope){Link('接入证据','../../Models/FirstLevelTrainGameV1/'+integrationFile,$('runtime'));Element('span',' · ',$('runtime'));Link('本地游戏','http://127.0.0.1:8137/Taierzhuang1938/?whitebox=p012',$('runtime'));}
 for(const name of row.newSources){const s=states.get(name),b=Element('button',name,$('sources'));b.className='source '+(s?.status==='success'?'ok':s?.status==='querying'?'active':'');Element('span',(reviews.get(name)?.assessment?.retakeRequired?'已生成 · 初筛需补拍':reviews.get(name)?.assessment?'已生成 · 已初筛待复核':statusLabels[s?.status]||'待提交')+' · '+requests.get(name).expectedCredits+' 积分',b);b.onclick=()=>ShowSource(name);}
 for(const old of row.reused){const a=Link('复用 '+old.id+' · '+(old.category==='legacy_bip_fbx'?'原 BIP/FBX':'已有视频恢复'),'../index.html?action='+encodeURIComponent(old.id),$('sources'));a.className='source';}
 if(!row.newSources.includes(selectedSource)){selectedSource=null;$('video').pause();$('video').hidden=true;$('note').textContent='选择一条新片查看视频与提示词。复用条目打开既有实时预览。';$('links').replaceChildren();}
 RenderRows();
}
function RenderRows(){const q=$('search').value.toLowerCase();$('rows').replaceChildren();for(const row of plan.requirements){const label=labels.labels[row.requirementId]||'';if(!(row.requirementId+' '+label).toLowerCase().includes(q))continue;const entries=row.newSources.map(id=>states.get(id));const tr=Element('tr','',$('rows'));tr.className=row.requirementId===selected?'selected':'';for(const text of [row.requirementId,label,entries.filter(s=>s?.status==='success').length+'/'+entries.length,entries.filter(s=>s?.status==='querying').length,row.reused.length,integration?.requirementScopes?.[row.requirementId]?(integration.validationPending?'已启用 · 复验中':'部分接入'):'未接入'])Element('td',text,tr);tr.onclick=()=>Show(row.requirementId);}}
async function Refresh(){try{integrationFile='Data_GameIntegration.json';let response=await fetch('../../Models/FirstLevelTrainGameV1/'+integrationFile+'?t='+Date.now(),{cache:'no-store'});if(response.status===404){integrationFile='Data_ValidationProgress.json';response=await fetch('../../Models/FirstLevelTrainGameV1/'+integrationFile+'?t='+Date.now(),{cache:'no-store'});}if(!response.ok&&response.status!==404)throw Error('Integration HTTP '+response.status);integration=response.ok?await response.json():null;[plan,batch,inspection]=await Promise.all(['../../Models/FirstLevelSourceBatchV1/Data_CoveragePlan.json','../../Models/FirstLevelSourceBatchV1/Data_BatchStatus.json','../../Models/FirstLevelSourceBatchV1/Data_SourceInspection.json'].map(url=>fetch(url+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})));states=new Map(batch.sources.map(s=>[s.id,s]));reviews=new Map(inspection.sources.map(s=>[s.id,s]));$('metrics').replaceChildren();for(const [label,value] of [['已列需求',plan.requirements.length],['新增原片成功',(batch.summary.success||0)+' / '+plan.requestedSources],['生成中 / 待对账',(batch.summary.querying||0)+' / '+(batch.summary.uncertain_submission||0)],['已初筛 / 需补拍',inspection.screened+' / '+inspection.retakeRequired],['提交预留积分',batch.committedCredits],['全批首轮预计',plan.expectedFirstPassCredits]]){const d=Element('div',label,$('metrics'));d.className='metric';Element('b',value,d);}$('refresh').textContent='实际回执更新：'+new Date(batch.updatedUnix*1000).toLocaleString()+(batch.status==='running'?' · 批次生成中':' · 本轮提交结束；失败和待对账项仍未完成')+' · 预留积分含失败和状态不明请求，非净扣费；此页不会提交或扣费。';Show(selected);}catch(e){$('refresh').textContent='读取失败：'+e.message}}
$('search').oninput=RenderRows;$('reload').onclick=Refresh;await Refresh();setInterval(Refresh,15000);window.SourceBatchReview={get plan(){return plan},get batch(){return batch},Show,ShowSource};
</script></html>'''
    version=json.loads((folder.parent/'Animation/FirstLevelTrain/Data_FirstLevelTrainAnimation.json').read_text(encoding='utf-8'))['version']
    assert re.fullmatch(r'FirstLevelTrainGameV[1-9]\d*',version)
    html=html.replace('FirstLevelTrainGameV1',version)
    html=html.replace("integration=response.ok?await response.json():null;", "integration=response.ok?await response.json():null;if(integration&&missionStatus.gameIntegrationCompatibility?.fullCampaignCurrent===false)integration.validationPending=true;")
    html=html.replace('已启用 · 关卡复验中：','已启用 · 当前完整关卡待复验：').replace('已启用 · 复验中','已启用 · 全流程待验')
    html=html.replace('初筛未通过 · 需补拍。','原片有限制 · 复用可见段并后期补做。').replace('已生成 · 初筛需补拍','已有原片 · 受限段待补做')
    html=html.replace("+' · '+requests.get(name).expectedCredits+' 积分'", "+' · 不再生成视频'")
    html=html.replace("['已初筛 / 需补拍',inspection.screened+' / '+inspection.retakeRequired]", "['已初筛 / 原片有限制',inspection.screened+' / '+inspection.retakeRequired]")
    html=html.replace("['提交预留积分',batch.committedCredits],['全批首轮预计',plan.expectedFirstPassCredits]", "['已有重定向候选',inspection.sources.filter(s=>s.retargetCandidate).length],['后续新视频',0]")
    html=html.replace(' · 预留积分含失败和状态不明请求，非净扣费；此页不会提交或扣费。',' · 用户已取消补拍；来源问题按现有动作与后期制作解决。')
    html=html.replace(" for(const old of row.reused)", " const resolutions=missionStatus.requirements.find(r=>r.requirementId===rid)?.existingSourceResolutions||[];for(const resolution of resolutions){Element('p',resolution.sourceId+'：'+resolution.method,$('sources'));for(const id of resolution.reuseActionIds){const link=Link('已有动作参考 · '+id,'../index.html?action='+encodeURIComponent(id),$('sources'));link.className='source';}}\n for(const old of row.reused)")
    html=html.replace("if(scope){Link('接入证据'", "if(scope){Link('当前逐项状态','./Data_MissionStatus.json',$('runtime'));Element('span',' · ',$('runtime'));Link('历史接入证据'")
    html=html.replace('<th>新片成功</th><th>生成中</th><th>复用条目</th>', '<th>已有视频</th><th>身体候选</th><th>复用条目</th>')
    html=html.replace("entries.filter(s=>s?.status==='querying').length,row.reused.length", "missionStatus.requirements.find(r=>r.requirementId===row.requirementId)?.newRecoveryCandidates?.length||0,row.reused.length")
    html=html.replace("['新增原片成功'", "['首轮已有原片'").replace("['生成中 / 待对账'", "['历史查询 / 待对账'")
    html=html.replace("querying:'生成中'", "querying:'原任务查询中'").replace("waiting_for_credit:'等待积分'", "waiting_for_credit:'历史未提交 · 已取消'")
    html=html.replace('选择一条新片查看视频与提示词。', '选择已有片段查看视频与来源记录。')
    html=html.replace("RenderRows();\n}", "const current=missionStatus.requirements.find(r=>r.requirementId===rid);Element('p','制作边界：'+current.acceptanceRequirements,$('sources'));Element('p','复用方案和身体候选仍需接触、姿态与职责装配验收；历史失败或未回执片段不再补拍。',$('sources'));RenderRows();\n}")
    html=html.replace("const resolutions=missionStatus.requirements", "const authored=missionStatus.requirements.find(r=>r.requirementId===rid)?.newAuthoredCandidates||[];for(const url of new Set(authored.map(v=>v.previewUrl))){const variants=authored.filter(v=>v.previewUrl===url);const link=Link('作者动作三栏 · '+variants.length+' 套原人物 · '+variants[0].clip+' · '+variants[0].status,url,$('sources'));link.className='source';}const resolutions=missionStatus.requirements")
    html=html.replace("missionStatus.requirements.find(r=>r.requirementId===row.requirementId)?.newRecoveryCandidates?.length||0", "(missionStatus.requirements.find(r=>r.requirementId===row.requirementId)?.newRecoveryCandidates?.length||0)+(missionStatus.requirements.find(r=>r.requirementId===row.requirementId)?.newAuthoredCandidates?.length||0)")
    html=html.replace('<th>复用条目</th>', '<th>可复用动作</th>')
    html=html.replace('row.reused.length,integration', "new Set([...row.reused.map(r=>r.id),...(missionStatus.requirements.find(r=>r.requirementId===row.requirementId)?.existingSourceResolutions||[]).flatMap(r=>r.reuseActionIds)]).size,integration")
    assert '需补拍' not in html and '提交预留积分' not in html
    (out/'index.html').write_text(html,encoding='utf-8')
    print(str(out/'index.html'))


if __name__=='__main__':
    Main()
