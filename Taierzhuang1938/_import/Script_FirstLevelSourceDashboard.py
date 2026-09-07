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
    (out/'Data_Labels.json').write_text(json.dumps(dict(labels=labels,requests=requests),ensure_ascii=False),encoding='utf-8')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第一关 · 48 项素材制作</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#e0e5dd;background:#111a20}*{box-sizing:border-box}body{margin:0;padding:28px}h1{font-size:26px;margin:0 0 8px}p{color:#adbbb9;line-height:1.65}a{color:#cddd9e}button,input{font:inherit}button{background:#223239;border:1px solid #425253;border-radius:6px;padding:8px 11px;color:#e0e5dd;cursor:pointer}button:hover{border-color:#cddd9e}.metrics{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.metric{min-width:160px;padding:16px;background:#1b292f;border-top:2px solid #9eaf82}.metric b{display:block;font-size:28px;margin-top:6px}.layout{display:grid;grid-template-columns:minmax(560px,1.2fr) minmax(430px,1fr);gap:22px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:12px 9px;text-align:left;border-bottom:1px solid #33434a}th{position:sticky;top:0;background:#18262c}tbody tr:hover,tbody tr.selected{background:#263b3e}td:first-child{color:#cddd9e;font-weight:700;white-space:nowrap}.left{max-height:70vh;overflow:auto}.detail{padding:20px;background:#19272e;border:1px solid #33444a;border-radius:8px}.sources{display:flex;gap:8px;flex-wrap:wrap}.source{display:block;text-align:left;width:100%;margin:5px 0}.source span{display:block;color:#abb9b7;font-size:12px;margin-top:3px}.source.ok{border-color:#839e65}.source.active{border-color:#cfb87b}video{display:block;width:100%;max-height:340px;background:#10161a;margin:14px 0}#note{font-size:13px}#refresh{font-size:12px;color:#94a6a6}.toolbar{display:flex;gap:12px;margin:12px 0}input{padding:8px;background:#19272e;color:#eee;border:1px solid #455;border-radius:5px;flex:1}@media(max-width:1000px){body{padding:16px}.layout{grid-template-columns:1fr}.left{max-height:45vh}}
</style>
<h1>第一关 · 48 项素材制作</h1><p>已有视频与动作复用；缺项按角色补单人原片。生成成功后仍需验片、恢复、重定向与接入验证。</p>
<div id="metrics" class="metrics"></div><div class="toolbar"><input id="search" aria-label="筛选需求" placeholder="筛选 FL ID、角色或动作"><button id="reload">刷新</button></div><div id="refresh"></div>
<div class="layout"><div class="left"><table><thead><tr><th>需求</th><th>动作／角色</th><th>新片成功</th><th>生成中</th><th>复用条目</th></tr></thead><tbody id="rows"></tbody></table></div><div class="detail"><h2 id="title">选择需求</h2><div id="sources" class="sources"></div><video id="video" controls playsinline preload="metadata" hidden></video><p id="note"></p><div id="links"></div></div></div>
<script type="module">
const $=id=>document.getElementById(id),labels=await(await fetch('./Data_Labels.json')).json(),requests=new Map(labels.requests.map(r=>[r.id,r]));
const statusLabels={unsubmitted:'待提交',querying:'生成中',success:'已生成 · 待验片',waiting_for_credit:'等待积分',fail:'服务生成失败',uncertain_submission:'提交状态待核实',success_download_missing:'生成成功 · 下载待核实'};
let plan,batch,states,inspection={sources:[]},reviews=new Map(),selected='FL01',selectedSource=null;
function Element(tag,text,parent){const e=document.createElement(tag);e.textContent=text;if(parent)parent.append(e);return e}
function Link(text,href,parent){const a=Element('a',text,parent);a.href=href;a.target='_blank';a.rel='noopener';return a}
function ShowSource(name){const s=states.get(name),request=requests.get(name),review=reviews.get(name)?.assessment;selectedSource=name;const video=$('video');video.pause();video.hidden=true;video.removeAttribute('src');$('links').replaceChildren();
 if(s?.status==='success'&&s.files?.length){const filename=s.files[0].replaceAll('\\\\','/').split('/').at(-1);const base='../../Video/Sources/FirstLevelV1/'+encodeURIComponent(name)+'/';video.src=base+encodeURIComponent(filename);video.poster=base+'Texture_SourceFirstFrame.jpg';video.hidden=false;}
 $('note').textContent=(review?.retakeRequired?'初筛未通过 · 需补拍。':review?'已初筛 · 待逐帧复核。':(statusLabels[s?.status]||'待提交')+'。')+(review?((review.observed||'')+' '+(review.limitations||review.cameraLimitation||'')+'。'):'')+(s?.failReason?'服务原因：'+s.failReason+'。':'')+(request?.prompt||'');
 if(review){Link('初筛证据','../../'+(review.evidence||reviews.get(name).contactSheet),$('links'));Element('span',' · ',$('links'));}
 const dense=reviews.get(name)?.denseAssessment,retarget=reviews.get(name)?.retargetAssessment;
 if(dense){$('note').textContent='密集抽帧与二维追踪已审阅；仍待三维接触修正。'+dense.observed+' '+(retarget?.observed||'')+' 原提示词：'+(request?.prompt||'');Link('密集审阅记录','../../Video/Sources/FirstLevelV1/'+name+'/DenseReview/Data_VisualAssessment.json',$('links'));Element('span',' · ',$('links'));}
 if(retarget&&!dense)$('note').textContent=retarget.observed+' 原提示词：'+(request?.prompt||'');
 Link('该原片收据','../../Video/Sources/FirstLevelV1/'+name+'/Data_GenerationSubmit.json',$('links'));
 const candidate=reviews.get(name)?.retargetCandidate;if(candidate){Element('span',' · ',$('links'));Link('原片／原始骨骼／原模型三栏 · 待审阅','../index.html?action='+encodeURIComponent(candidate.previewId),$('links'));}
 for(const h of reviews.get(name)?.retargetHistory||[]){Element('span',' · ',$('links'));Link((h.variantId===candidate?.variantId?'当前审阅 · ':'历史审阅 · ')+h.variantId,'../../'+h.path,$('links'));}
}
function Show(rid){selected=rid;const row=plan.requirements.find(r=>r.requirementId===rid);$('title').textContent=rid+' '+labels.labels[rid];$('sources').replaceChildren();
 for(const name of row.newSources){const s=states.get(name),b=Element('button',name,$('sources'));b.className='source '+(s?.status==='success'?'ok':s?.status==='querying'?'active':'');Element('span',(reviews.get(name)?.assessment?.retakeRequired?'已生成 · 初筛需补拍':reviews.get(name)?.assessment?'已生成 · 已初筛待复核':statusLabels[s?.status]||'待提交')+' · '+requests.get(name).expectedCredits+' 积分',b);b.onclick=()=>ShowSource(name);}
 for(const old of row.reused){const a=Link('复用 '+old.id+' · '+(old.category==='legacy_bip_fbx'?'原 BIP/FBX':'已有视频恢复'),'../index.html?action='+encodeURIComponent(old.id),$('sources'));a.className='source';}
 if(!row.newSources.includes(selectedSource)){selectedSource=null;$('video').pause();$('video').hidden=true;$('note').textContent='选择一条新片查看视频与提示词。复用条目打开既有实时预览。';$('links').replaceChildren();}
 RenderRows();
}
function RenderRows(){const q=$('search').value.toLowerCase();$('rows').replaceChildren();for(const row of plan.requirements){const label=labels.labels[row.requirementId]||'';if(!(row.requirementId+' '+label).toLowerCase().includes(q))continue;const entries=row.newSources.map(id=>states.get(id));const tr=Element('tr','',$('rows'));tr.className=row.requirementId===selected?'selected':'';for(const text of [row.requirementId,label,entries.filter(s=>s?.status==='success').length+'/'+entries.length,entries.filter(s=>s?.status==='querying').length,row.reused.length])Element('td',text,tr);tr.onclick=()=>Show(row.requirementId);}}
async function Refresh(){try{[plan,batch,inspection]=await Promise.all(['../../Models/FirstLevelSourceBatchV1/Data_CoveragePlan.json','../../Models/FirstLevelSourceBatchV1/Data_BatchStatus.json','../../Models/FirstLevelSourceBatchV1/Data_SourceInspection.json'].map(url=>fetch(url+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})));states=new Map(batch.sources.map(s=>[s.id,s]));reviews=new Map(inspection.sources.map(s=>[s.id,s]));$('metrics').replaceChildren();for(const [label,value] of [['已列需求',plan.requirements.length],['新增原片成功',(batch.summary.success||0)+' / '+plan.requestedSources],['生成中',batch.summary.querying||0],['已初筛 / 需补拍',inspection.screened+' / '+inspection.retakeRequired],['提交预留积分',batch.committedCredits],['全批首轮预计',plan.expectedFirstPassCredits]]){const d=Element('div',label,$('metrics'));d.className='metric';Element('b',value,d);}$('refresh').textContent='实际回执更新：'+new Date(batch.updatedUnix*1000).toLocaleString()+(batch.status==='running'?' · 批次生成中':' · 本轮提交结束；失败和待对账项仍未完成')+' · 预留积分含失败和状态不明请求，非净扣费；此页不会提交或扣费。';Show(selected);}catch(e){$('refresh').textContent='读取失败：'+e.message}}
$('search').oninput=RenderRows;$('reload').onclick=Refresh;await Refresh();setInterval(Refresh,15000);window.SourceBatchReview={get plan(){return plan},get batch(){return batch},Show,ShowSource};
</script></html>'''
    (out/'index.html').write_text(html,encoding='utf-8')
    print(str(out/'index.html'))


if __name__=='__main__':
    Main()
