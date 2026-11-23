// 独立战斗实验面板：只配置初始条件和显示规则状态，不代替玩家执行战斗。
//
// 2026-11-23 改成其他测试场同一套面板（.shellImpactLab：设置页口径 —— 分组小标题、直角按钮组、选中金条、
// 读数块、可收起），并加「玩法」两组切换：操控（原版蓄力 / 方向挥砍·对标 Mordhau）× 命中反馈
//（原版 / 卡刀·拔刀·补刀），四种组合随时切、立即重开当前项目对照。方向挥砍时屏幕中心另画一圈八向指示。
// DOM 与事件纪律照 Script_ShellImpactLab：mousedown / mouseup / keydown / keyup 一律 stopPropagation；
// Alt 交还给 Script_Main（放开指针锁点面板，松手收回）；Escape 不拦。
//
// 面板上的每一句都走 `T("range.melee.…")`（表在 Data_Text_Range.mjs）。
// 两处**不**进表、只当参数带进模板的东西：
//   · MELEE_SCENARIOS 的 name / tip —— 项目单与提示语是内容数据（Data_MeleeCombat）；
//   · snapshot.nearby —— 运行时给的"走近了哪一块标牌"，也是数据里的名字。
import { MELEE_SCENARIOS, MELEE_ANIMATION_ACTIONS, MELEE_ENCOUNTERS, MELEE_VARIANTS, MELEE_DIRECTIONAL } from './Data_MeleeCombat.mjs';
import { T, HasText } from './Script_Text.mjs';
// 相位、分工、来向、出刀类型都是 Data_MeleeCombat 的 ASCII id，键按 id 拼（DYNAMIC_PREFIXES 已登记）。
const StateKey = phase => 'range.melee.state.' + phase;
const RoleKey = role => 'range.melee.role.' + role;
const Named = (key, id) => (HasText(key) ? T(key) : id);
const DirName = id => Named('range.melee.dir.' + id, id);
const KindName = id => Named('range.melee.kind.' + id, id);
/** 玩家相位：没登记的相位原样显示 id（看得见是哪一个漏了），没有相位时显示"准备"。 */
const PlayerPhase = phase => (phase
  ? (HasText(StateKey(phase)) ? T(StateKey(phase)) : phase)
  : T('range.melee.phaseReady'));
/** 对手相位：认不出时按"警戒"算（与改造前 `StateLabel[...] || '警戒'` 逐字等价）。 */
const TargetPhase = phase => (phase && HasText(StateKey(phase))
  ? T(StateKey(phase)) : T('range.melee.state.idle'));
const ControlName = id => (id === 'directional' ? T('range.melee.control.directional') : T('range.melee.control.classic'));
const ImpactName = id => (id === 'lodge' ? T('range.melee.impact.lodge') : T('range.melee.impact.classic'));
export class MeleeLab {
  constructor(host) {
    this.host=host;
    document.body.classList.add('meleeLabActive');
    this.root=document.createElement('section'); this.root.className='shellImpactLab meleeLab';
    this.root.setAttribute('aria-label',T('range.melee.aria'));
    const controlButtons=MELEE_VARIANTS.control.map(id=>`<button type="button" class="siBtn mlControl" data-control="${id}">${ControlName(id)}</button>`).join('');
    const impactButtons=MELEE_VARIANTS.impact.map(id=>`<button type="button" class="siBtn mlImpact" data-impact="${id}">${ImpactName(id)}</button>`).join('');
    const assistButtons=[['tap',T('range.melee.assistTap')],['hold',T('range.melee.assistHold')],['auto',T('range.melee.assistAuto')]]
      .map(([id,label])=>`<button type="button" class="siBtn mlAssist" data-assist="${id}">${label}</button>`).join('');
    this.root.innerHTML=`
      <div class="siHead"><b>${T('range.melee.title')}</b><span>${T('range.melee.subtitle')}</span>
        <button type="button" class="siCollapse" aria-expanded="true">${T('range.melee.collapse')}</button></div>
      <div class="siBody">
        <h3>${T('range.melee.group.variant')}</h3>
        <p class="siLabel">${T('range.melee.controlLabel')}</p><div class="siButtons">${controlButtons}</div>
        <p class="siHint mlControlHint"></p>
        <p class="siLabel">${T('range.melee.impactLabel')}</p><div class="siButtons">${impactButtons}</div>
        <p class="siHint mlImpactHint"></p>
        <h3>${T('range.melee.group.scenario')}</h3>
        <select class="siSelect mlScenario" aria-label="${T('range.melee.scenarioAria')}">${MELEE_SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
        <p class="siHint mlTip"></p>
        <div class="siButtons"><button type="button" class="siBtn siFire mlStart">${T('range.melee.btnStart')}</button><button type="button" class="siBtn mlPause">${T('range.melee.btnPause')}</button></div>
        <h3>${T('range.melee.group.controls')}</h3>
        <div class="siRead mlControls"></div>
        <p class="siHint">${T('range.melee.controlAlt')}</p>
        <h3>${T('range.melee.group.readout')}</h3>
        <output class="siTargetRead mlStatus" aria-live="polite"></output>
        <div class="siRead mlMeters"></div>
        <div class="siRead mlTargets"></div>
        <h3>${T('range.melee.assistLabel')}</h3><div class="siButtons">${assistButtons}</div>
        <details class="siDetails"><summary>${T('range.melee.animSummary')}</summary>
          <select class="siSelect mlAnimation" aria-label="${T('range.melee.animLabel')}">${MELEE_ANIMATION_ACTIONS.map(a=>`<option>${a}</option>`).join('')}</select>
          <div class="siButtons"><button type="button" class="siBtn mlPreview">${T('range.melee.btnPreview')}</button><button type="button" class="siBtn mlResume">${T('range.melee.btnResumeFight')}</button></div>
          <input class="siRange mlTime" type="range" min="0" max="1" step="0.01" value="0" aria-label="${T('range.melee.animTimeAria')}">
          <p class="siHint">${T('range.melee.animNote')}</p></details>
        <details class="siDetails"><summary>${T('range.melee.logSummary')}</summary><div class="siRead mlLog"></div></details>
      </div>`;
    document.body.append(this.root);
    // 方向挥砍的八向指示：准心外一圈短刻度，暗金＝现在按左键会从哪边来，亮金＝正在砍的这一刀。
    this.ring=document.createElement('div'); this.ring.className='mlDirRing'; this.ring.hidden=true; this.ring.setAttribute('aria-hidden','true');
    this.ring.innerHTML=MELEE_DIRECTIONAL.directions.map(d=>`<i data-dir="${d.id}" style="--a:${-d.angleDeg}deg"></i>`).join('')+'<b class="mlDirName"></b>';
    document.body.append(this.ring);
    this.select=this.root.querySelector('.mlScenario');
    this.currentScenario=this.select.value;
    const Click=(selector,action)=>{for(const el of this.root.querySelectorAll(selector))el.onclick=(e)=>{action(el,e);e.currentTarget.blur();host.Focus?.();};};
    Click('.mlStart',()=>host.Start(this.select.value));
    Click('.mlPause',(el)=>{const on=host.Pause();el.textContent=on?T('range.melee.btnResume'):T('range.melee.btnPause');});
    Click('.mlControl',(el)=>host.SetVariant({control:el.dataset.control}));
    Click('.mlImpact',(el)=>host.SetVariant({impact:el.dataset.impact}));
    Click('.mlAssist',(el)=>{host.SetAssist(el.dataset.assist);this.assist=el.dataset.assist;});
    Click('.mlPreview',()=>host.Preview(this.root.querySelector('.mlAnimation').value));
    Click('.mlResume',()=>host.Preview(null));
    this.root.querySelector('.mlTime').oninput=e=>host.Preview(this.root.querySelector('.mlAnimation').value,Number(e.target.value));
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
    this.select.onchange=()=>this.root.querySelector('.mlTip').textContent=MELEE_SCENARIOS.find(s=>s.id===this.select.value).tip;
    this.select.onchange();
    this.assist='tap';
  }
  Put(sel,text){const el=typeof sel==='string'?this.root.querySelector(sel):sel;if(el&&el.textContent!==text)el.textContent=text;}
  Flag(el,name,on){if(el&&el.classList.contains(name)!==!!on)el.classList.toggle(name,!!on);}
  Update(snapshot) {
    if(!snapshot)return;
    this.root.hidden=!!snapshot.menu;
    const s=MELEE_SCENARIOS.find(s=>s.id===snapshot.scenario);
    if(this.currentScenario!==snapshot.scenario){this.currentScenario=snapshot.scenario;this.select.value=snapshot.scenario;this.select.onchange();}
    const variant=snapshot.variant||{control:'classic',impact:'classic'};
    for(const el of this.root.querySelectorAll('.mlControl'))this.Flag(el,'active',el.dataset.control===variant.control);
    for(const el of this.root.querySelectorAll('.mlImpact'))this.Flag(el,'active',el.dataset.impact===variant.impact);
    for(const el of this.root.querySelectorAll('.mlAssist'))this.Flag(el,'active',el.dataset.assist===this.assist);
    const directional=variant.control==='directional', lodge=variant.impact==='lodge';
    this.Put('.mlControlHint',directional?T('range.melee.control.directionalHint'):T('range.melee.control.classicHint'));
    this.Put('.mlImpactHint',lodge?T('range.melee.impact.lodgeHint'):T('range.melee.impact.classicHint'));
    const controls=directional
      ?[T('range.melee.controlSwing'),T('range.melee.controlFeint'),T('range.melee.controlCombo')]
      :[T('range.melee.controlAttack'),T('range.melee.controlParry')];
    controls.push(T('range.melee.controlPress'));
    if(lodge)controls.push(T('range.melee.controlLodge'));
    controls.push(T('range.melee.controlWeapon'));
    this.Put('.mlControls',controls.join('\n'));
    this.Put('.mlPause',snapshot.paused?T('range.melee.btnResume'):T('range.melee.btnPause'));
    const f=snapshot.player, living=snapshot.targets.filter(t=>t.alive&&t.side==='ija');
    // 「共几组」照遭遇表数，不写死 —— 加一组标牌不该让面板继续说"六组"。
    this.Put('.mlStatus',!snapshot.alive?T('range.melee.statusDead')
      :s?.kind==='field'?T('range.melee.statusField',{done:snapshot.completed?.length||0,total:MELEE_ENCOUNTERS.length,
        state:snapshot.encounter?T('range.melee.statusEncounter'):snapshot.nearby||T('range.melee.statusApproach')})
      :!living.length?T('range.melee.statusCleared')
      :T('range.melee.statusRemain',{name:s?.name||'',living:living.length}));
    const meters=[T('range.melee.meters',{
      weapon:snapshot.weapon==='Dadao'?T('range.melee.weaponDadao')
        :snapshot.stance==='melee'?T('range.melee.weaponBayonet'):T('range.melee.weaponRifle'),
      phase:PlayerPhase(f?.phase),
      parry:f?.parryActive?T('range.melee.parryWindow'):'',
      health:Math.round(snapshot.health),stamina:Math.round(f?.stamina??100),poise:Math.round(f?.poise??100)})];
    if(directional)meters.push(T('range.melee.readSwing',{direction:DirName(f?.direction||snapshot.swingPreview||MELEE_DIRECTIONAL.defaultDirection),
      kind:f?.attackKind?T('range.melee.readKind',{kind:KindName(f.attackKind)}):''}));
    if(snapshot.lodge)meters.push(T('range.melee.readLodge',{progress:Math.round(snapshot.lodge.progress*100),seconds:snapshot.lodge.timeLeft.toFixed(1)}));
    if(snapshot.finishTarget!=null)meters.push(T('range.melee.readFinish',{target:snapshot.finishTarget}));
    if(directional||lodge)meters.push(T('range.melee.readStats',{...snapshot.stats}));
    this.Put('.mlMeters',meters.join('\n'));
    const shown=s?.kind==='field'?snapshot.targets.filter(t=>snapshot.encounter&&t.id.startsWith(snapshot.encounter+'_')):snapshot.targets;
    this.Put('.mlTargets',shown.length?shown.map(t=>T('range.melee.targetLine',{
      side:t.side==='nra'?T('range.melee.sideNra'):T('range.melee.sideIja'),id:t.id,
      body:!t.alive?T('range.melee.targetDown')
        :t.pose?.role?T('range.melee.targetAliveRole',{distance:t.distance.toFixed(2),
          health:Math.round(t.health),phase:TargetPhase(t.pose.phase),role:T(RoleKey(t.pose.role))})
        :T('range.melee.targetAlive',{distance:t.distance.toFixed(2),
          health:Math.round(t.health),phase:TargetPhase(t.pose?.phase)})})).join('\n')
      :T('range.melee.targetsIdle',{living:living.length}));
    this.Put('.mlLog',snapshot.events.slice(-5).reverse().map(e=>`${e.time.toFixed(1)} ${e.kind}${e.direction?' '+e.direction:''}${e.target!=null?' → '+e.target:''}`).join('\n'));
    // 八向指示
    const ring=directional&&snapshot.alive&&!snapshot.menu;
    if(this.ring.hidden===ring)this.ring.hidden=!ring;
    if(ring){
      const swinging=f?.phase&&['windup','active','recovery'].includes(f.phase)?f.direction:null;
      for(const tick of this.ring.querySelectorAll('i')){
        this.Flag(tick,'preview',tick.dataset.dir===snapshot.swingPreview);
        this.Flag(tick,'swing',tick.dataset.dir===swinging);
      }
      this.Put(this.ring.querySelector('.mlDirName'),swinging?DirName(swinging):'');
    }
  }
  Dispose(){this.root.remove();this.ring.remove();document.body.classList.remove('meleeLabActive');}
}
