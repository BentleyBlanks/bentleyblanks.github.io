// 独立战斗实验面板：只配置初始条件和显示规则状态，不代替玩家执行战斗。
//
// 2026-11-23 改成其他测试场同一套面板（.shellImpactLab：分组小标题、直角按钮组、选中金条、读数块、可收起），
// 加「玩法」两组切换：操控（原版蓄力 / 拖拽挥砍）× 命中反馈（原版 / 卡刀·拔刀·补刀），切了立即重开当前项目。
// 同日第二轮（用户）：只保留最基本的布局 —— QTE 输入、动作检查、最近交锋三段撤掉（取证口里的同名功能还在），
// 项目只列一对一。第三轮：八向指示圈撤了（用户：不要轮盘选方向），「玩法」组加一条滑条 ——
// 拖拽挥砍时视角跟刀的比例（0 = 只动刀，1 = 视角全跟）。
// DOM 与事件纪律照 Script_ShellImpactLab：mousedown / mouseup / keydown / keyup 一律 stopPropagation；
// Alt 交还给 Script_Main（放开指针锁点面板，松手收回）；Escape 不拦。
//
// 面板上的每一句都走 `T("range.melee.…")`（表在 Data_Text_Range.mjs）。
// MELEE_SCENARIOS 的 name / tip 是内容数据（Data_MeleeCombat），只当参数带进来。
import { MELEE_SCENARIOS, MELEE_VARIANTS } from './Data_MeleeCombat.mjs';
import { T, HasText } from './Script_Text.mjs';
// 相位是 Data_MeleeCombat 的 ASCII id，键按 id 拼（DYNAMIC_PREFIXES 已登记）。
const StateKey = phase => 'range.melee.state.' + phase;
/** 玩家相位：没登记的相位原样显示 id（看得见是哪一个漏了），没有相位时显示"准备"。 */
const PlayerPhase = phase => (phase
  ? (HasText(StateKey(phase)) ? T(StateKey(phase)) : phase)
  : T('range.melee.phaseReady'));
/** 对手相位：认不出时按"警戒"算。 */
const TargetPhase = phase => (phase && HasText(StateKey(phase))
  ? T(StateKey(phase)) : T('range.melee.state.idle'));
const ControlName = id => (id === 'drag' ? T('range.melee.control.drag') : T('range.melee.control.classic'));
const ImpactName = id => (
  id === 'lodge' ? T('range.melee.impact.lodge')
  : id === 'cleave' ? T('range.melee.impact.cleave')
  : id === 'slide' ? T('range.melee.impact.slide')
  : id === 'crush' ? T('range.melee.impact.crush')
  : id === 'pofeng' ? T('range.melee.impact.pofeng')
  : T('range.melee.impact.classic')
);
const ImpactDesc = id => (
  id === 'lodge' ? T('range.melee.desc.lodge')
  : id === 'cleave' ? T('range.melee.desc.cleave')
  : id === 'slide' ? T('range.melee.desc.slide')
  : id === 'crush' ? T('range.melee.desc.crush')
  : id === 'pofeng' ? T('range.melee.desc.pofeng')
  : T('range.melee.desc.classic')
);
const IdleGuide = id => (
  id === 'lodge' ? T('range.melee.guide.idle.lodge')
  : id === 'cleave' ? T('range.melee.guide.idle.cleave')
  : id === 'slide' ? T('range.melee.guide.idle.slide')
  : id === 'crush' ? T('range.melee.guide.idle.crush')
  : id === 'pofeng' ? T('range.melee.guide.idle.pofeng')
  : T('range.melee.guide.idle.classic')
);
/** 面板只列一对一（没有友军）的项目；多打一与敌友对练只给取证口。 */
export const MELEE_LAB_SCENARIOS = MELEE_SCENARIOS.filter(s => s.enemies === 1 && !s.allies);
export class MeleeLab {
  constructor(host) {
    this.host=host;
    document.body.classList.add('meleeLabActive');
    this.root=document.createElement('section'); this.root.className='shellImpactLab meleeLab';
    this.root.hidden=true;
    this.root.setAttribute('aria-label',T('range.melee.aria'));
    const controlButtons=MELEE_VARIANTS.control.map(id=>`<button type="button" class="siBtn mlControl" data-control="${id}">${ControlName(id)}</button>`).join('');
    const impactRows=[];
    for(let i=0;i<MELEE_VARIANTS.impact.length;i+=2){
      const row=MELEE_VARIANTS.impact.slice(i,i+2).map(id=>`<button type="button" class="siBtn mlImpact" data-impact="${id}">${ImpactName(id)}</button>`).join('');
      impactRows.push(`<div class="siButtons">${row}</div>`);
    }
    this.root.innerHTML=`
      <div class="siHead"><b>${T('range.melee.title')}</b><span>${T('range.melee.subtitle')}</span>
        <button type="button" class="siCollapse" aria-expanded="true">${T('range.melee.collapse')}</button></div>
      <div class="siBody">
        <h3>${T('range.melee.group.variant')}</h3>
        <p class="siLabel">${T('range.melee.controlLabel')}</p><div class="siButtons">${controlButtons}</div>
        <p class="siLabel mlFollowLabel"></p><input type="range" class="siRange mlFollow" min="0" max="100" step="5" aria-label="${T('range.melee.followAria')}">
        <p class="siLabel">${T('range.melee.impactLabel')}</p>${impactRows.join('')}
        <div class="mlModeCard"></div>
        <h3>${T('range.melee.group.scenario')}</h3>
        <select class="siSelect mlScenario" aria-label="${T('range.melee.scenarioAria')}">${MELEE_LAB_SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
        <div class="siButtons"><button type="button" class="siBtn siFire mlStart">${T('range.melee.btnStart')}</button><button type="button" class="siBtn mlPause">${T('range.melee.btnPause')}</button></div>
        <h3>${T('range.melee.group.controls')}</h3>
        <div class="siRead mlControls"></div>
        <h3>${T('range.melee.group.readout')}</h3>
        <div class="siRead mlMeters"></div>
      </div>`;
    document.body.append(this.root);
    this.guide=document.createElement('aside'); this.guide.className='mlGuideHud';
    this.guide.hidden=true;
    this.guide.innerHTML='<div class="mlGuideTop"><b class="mlGuideMode"></b><span class="mlGuideMeta"></span></div><div class="mlGuideStep"></div><div class="mlGuideBar" hidden><i></i></div>';
    document.body.append(this.guide);
    this.guideMode=this.guide.querySelector('.mlGuideMode');
    this.guideMeta=this.guide.querySelector('.mlGuideMeta');
    this.guideStep=this.guide.querySelector('.mlGuideStep');
    this.guideBar=this.guide.querySelector('.mlGuideBar');
    this.guideFill=this.guide.querySelector('.mlGuideBar i');
    this.select=this.root.querySelector('.mlScenario');
    this.currentScenario=this.select.value;
    const Click=(selector,action)=>{for(const el of this.root.querySelectorAll(selector))el.onclick=(e)=>{action(el,e);e.currentTarget.blur();host.Focus?.();};};
    Click('.mlStart',()=>host.Start(this.select.value));
    Click('.mlPause',(el)=>{const on=host.Pause();el.textContent=on?T('range.melee.btnResume'):T('range.melee.btnPause');});
    Click('.mlControl',(el)=>host.SetVariant({control:el.dataset.control}));
    Click('.mlImpact',(el)=>host.SetVariant({impact:el.dataset.impact}));
    this.follow=this.root.querySelector('.mlFollow');
    this.follow.oninput=()=>host.SetViewFollow?.(this.follow.value/100);
    this.follow.onchange=()=>{this.follow.blur();host.Focus?.();};
    this.root.querySelector('.siCollapse').onclick=(event)=>{
      const collapsed=this.root.classList.toggle('collapsed');
      event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
      event.currentTarget.textContent=collapsed?T('range.melee.expand'):T('range.melee.collapse');
      event.currentTarget.blur();
    };
    for(const type of ['mousedown','mouseup']) this.root.addEventListener(type,e=>e.stopPropagation());
    for(const type of ['keydown','keyup']) this.root.addEventListener(type,e=>{
      if(e.code==='AltLeft'||e.code==='AltRight'){
        if(type==='keyup')document.activeElement?.blur();
        return; // Main owns Alt release and returns the camera to combat.
      }
      if(e.code!=='Escape')e.stopPropagation();
    });
  }
  Put(sel,text){const el=typeof sel==='string'?this.root.querySelector(sel):sel;if(el&&el.textContent!==text)el.textContent=text;}
  Flag(el,name,on){if(el&&el.classList.contains(name)!==!!on)el.classList.toggle(name,!!on);}
  Update(snapshot) {
    if(!snapshot)return;
    const hide=snapshot.panelVisible===false||!!snapshot.menu;
    this.root.hidden=hide;
    this.guide.hidden=hide;
    if(hide)return;
    if(this.currentScenario!==snapshot.scenario && MELEE_LAB_SCENARIOS.some(s=>s.id===snapshot.scenario)){this.currentScenario=snapshot.scenario;this.select.value=snapshot.scenario;}
    const variant=snapshot.variant||{control:'classic',impact:'classic'};
    for(const el of this.root.querySelectorAll('.mlControl'))this.Flag(el,'active',el.dataset.control===variant.control);
    for(const el of this.root.querySelectorAll('.mlImpact'))this.Flag(el,'active',el.dataset.impact===variant.impact);
    this.Put('.mlModeCard',ImpactDesc(variant.impact));
    const drag=variant.control==='drag';
    const follow=Math.round((snapshot.viewFollow??0.5)*100);
    if(document.activeElement!==this.follow&&+this.follow.value!==follow)this.follow.value=String(follow);
    this.Put('.mlFollowLabel',T('range.melee.followLabel',{percent:follow}));
    const controls=drag?[T('range.melee.controlDrag'),T('range.melee.controlParryDrag')]:[T('range.melee.controlAttack'),T('range.melee.controlParry')];
    controls.push(T('range.melee.controlPress'));
    if(variant.impact==='lodge')controls.push(T('range.melee.controlLodge'));
    else if(variant.impact==='cleave')controls.push(T('range.melee.controlCleave'));
    else if(variant.impact==='slide')controls.push(T('range.melee.controlSlide'));
    else if(variant.impact==='crush')controls.push(T('range.melee.controlCrush'));
    else if(variant.impact==='pofeng')controls.push(T('range.melee.controlPofeng'));
    controls.push(T('range.melee.controlWeapon'));
    this.Put('.mlControls',controls.join('\n'));
    this.Put('.mlPause',snapshot.paused?T('range.melee.btnResume'):T('range.melee.btnPause'));
    const f=snapshot.player, enemy=snapshot.targets.find(t=>t.side==='ija');
    const meters=[!snapshot.alive?T('range.melee.statusDead'):T('range.melee.meters',{
      weapon:snapshot.weapon==='Dadao'?T('range.melee.weaponDadao')
        :snapshot.stance==='melee'?T('range.melee.weaponBayonet'):T('range.melee.weaponRifle'),
      phase:PlayerPhase(f?.phase),
      parry:f?.parryActive?T('range.melee.parryWindow'):'',
      health:Math.round(snapshot.health),stamina:Math.round(f?.stamina??100),poise:Math.round(f?.poise??100)})];
    if(enemy)meters.push(enemy.alive?T('range.melee.enemyLine',{distance:enemy.distance.toFixed(2),health:Math.round(enemy.health),phase:TargetPhase(enemy.pose?.phase)})
      :T('range.melee.enemyDown'));
    if(snapshot.enemyGuard&&enemy?.alive)meters.push(snapshot.enemyGuard.crushed?T('range.melee.readCrushed'):T('range.melee.readGuard',{guard:snapshot.enemyGuard.guardPoise}));
    if(snapshot.lodge)meters.push(T('range.melee.readLodge',{progress:Math.round(snapshot.lodge.progress*100)}));
    if(snapshot.cleave)meters.push(T('range.melee.readCleave',{progress:Math.round(snapshot.cleave.progress*100)}));
    if(snapshot.slide)meters.push(T('range.melee.readSlide',{progress:Math.round(snapshot.slide.progress*100),ready:snapshot.slide.ready?T('range.melee.readSlideReady'):''}));
    if(snapshot.finishTarget!=null&&!snapshot.enemyGuard?.crushed)meters.push(T('range.melee.readFinish'));
    this.Put('.mlMeters',meters.join('\n'));
    this.UpdateGuide(snapshot,variant,enemy);
  }
  UpdateGuide(snapshot,variant,enemy) {
    this.Put(this.guideMode,ImpactName(variant.impact));
    let step='',meta='',barPct=null,tone='';
    if(!enemy||!enemy.alive){
      step=Number.isFinite(snapshot.respawnIn)
        ?T('range.melee.guide.downRespawn',{seconds:snapshot.respawnIn.toFixed(1)})
        :T('range.melee.guide.down');
    }else if(snapshot.cleave){
      const pct=Math.round(snapshot.cleave.progress*100);
      step=T('range.melee.guide.cleave'); meta=T('range.melee.bar.cleave',{percent:pct}); barPct=pct; tone='hot';
    }else if(snapshot.slide){
      const pct=Math.round(snapshot.slide.progress*100);
      step=snapshot.slide.ready?T('range.melee.guide.slideReady'):T('range.melee.guide.slide');
      meta=T('range.melee.bar.slide',{percent:pct}); barPct=pct; tone=snapshot.slide.ready?'hot':'active';
    }else if(snapshot.lodge){
      const pct=Math.round(snapshot.lodge.progress*100);
      step=T('range.melee.guide.lodge'); meta=T('range.melee.bar.lodge',{percent:pct}); barPct=pct; tone='active';
    }else if(snapshot.enemyGuard?.crushed){
      step=T('range.melee.guide.crushed'); meta=T('range.melee.bar.guard',{percent:0}); barPct=0; tone='hot';
    }else if(snapshot.finishTarget!=null){
      step=T('range.melee.guide.finish'); tone='hot';
    }else{
      if(snapshot.enemyGuard){
        const gp=Math.round(snapshot.enemyGuard.guardPoise);
        meta=T('range.melee.bar.guard',{percent:gp}); barPct=gp;
      }
      if(snapshot.paused)step=T('range.melee.guide.paused');
      else if(enemy.distance>2.25)step=T('range.melee.guide.approach',{distance:enemy.distance.toFixed(1)});
      else step=IdleGuide(variant.impact);
    }
    this.Put(this.guideMeta,meta);
    this.Put(this.guideStep,step);
    this.Flag(this.guide,'active',tone==='active');
    this.Flag(this.guide,'hot',tone==='hot');
    this.guideBar.hidden=barPct===null;
    if(barPct!==null)this.guideFill.style.width=`${Math.max(0,Math.min(100,barPct))}%`;
  }
  Dispose(){this.root.remove();this.guide?.remove();document.body.classList.remove('meleeLabActive');}
}
