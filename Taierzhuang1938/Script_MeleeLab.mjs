// 独立战斗实验面板：只配置初始条件和显示规则状态，不代替玩家执行战斗。
//
// 面板上的每一句都走 `T("range.melee.…")`（表在 Data_Text_Range.mjs）。
// 两处**不**进表、只当参数带进模板的东西：
//   · MELEE_SCENARIOS 的 name / tip —— 项目单与提示语是内容数据（Data_MeleeCombat）；
//   · snapshot.nearby —— 运行时给的"走近了哪一块标牌"，也是数据里的名字。
import { MELEE_SCENARIOS, MELEE_ANIMATION_ACTIONS, MELEE_ENCOUNTERS } from './Data_MeleeCombat.mjs';
import { T, HasText } from './Script_Text.mjs';
// 相位与分工是 Data_MeleeCombat 的 ASCII id，键按 id 拼（DYNAMIC_PREFIXES 已登记）。
const StateKey = phase => 'range.melee.state.' + phase;
const RoleKey = role => 'range.melee.role.' + role;
/** 玩家相位：没登记的相位原样显示 id（看得见是哪一个漏了），没有相位时显示"准备"。 */
const PlayerPhase = phase => (phase
  ? (HasText(StateKey(phase)) ? T(StateKey(phase)) : phase)
  : T('range.melee.phaseReady'));
/** 对手相位：认不出时按"警戒"算（与改造前 `StateLabel[...] || '警戒'` 逐字等价）。 */
const TargetPhase = phase => (phase && HasText(StateKey(phase))
  ? T(StateKey(phase)) : T('range.melee.state.idle'));
export class MeleeLab {
  constructor(host) {
    this.host=host;
    document.body.classList.add('meleeLabActive');
    this.root=document.createElement('section'); this.root.className='meleeLab';
    this.root.setAttribute('aria-label',T('range.melee.aria'));
    // `<br>` 是排版不是文案：五行控制说明分别登记，这里串起来。
    const controls=[T('range.melee.controlAttack'),T('range.melee.controlParry'),
      T('range.melee.controlPress'),T('range.melee.controlWeapon')].join('<br>');
    this.root.innerHTML=`<div class="mlHeading"><b>${T('range.melee.title')}</b><span>${T('range.melee.subtitle')}</span></div>
      <label>${T('range.melee.scenarioLabel')}<select class="mlScenario" aria-label="${T('range.melee.scenarioAria')}">${MELEE_SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
      <div class="mlButtons"><button class="mlStart">${T('range.melee.btnStart')}</button><button class="mlPause">${T('range.melee.btnPause')}</button></div>
      <p class="mlTip"></p><p class="mlControls">${controls}<br><small>${T('range.melee.controlAlt')}</small></p>
      <output class="mlStatus" aria-live="polite"></output><div class="mlMeters"></div><div class="mlTargets"></div>
      <details><summary>${T('range.melee.animSummary')}</summary><label>${T('range.melee.animLabel')}<select class="mlAnimation">${MELEE_ANIMATION_ACTIONS.map(a=>`<option>${a}</option>`).join('')}</select></label><div class="mlButtons"><button class="mlPreview">${T('range.melee.btnPreview')}</button><button class="mlResume">${T('range.melee.btnResumeFight')}</button></div><label>${T('range.melee.animTimeLabel')}<input class="mlTime" type="range" min="0" max="1" step="0.01" value="0" aria-label="${T('range.melee.animTimeAria')}"></label><p>${T('range.melee.animNote')}</p></details>
      <label>${T('range.melee.assistLabel')}<select class="mlAssist"><option value="tap">${T('range.melee.assistTap')}</option><option value="hold">${T('range.melee.assistHold')}</option><option value="auto">${T('range.melee.assistAuto')}</option></select></label>
      <details><summary>${T('range.melee.logSummary')}</summary><div class="mlLog"></div></details>`;
    document.body.append(this.root);
    this.select=this.root.querySelector('.mlScenario');
    this.currentScenario=this.select.value;
    this.root.querySelector('.mlStart').onclick=(e)=>{host.Start(this.select.value);e.currentTarget.blur();host.Focus?.();};
    this.root.querySelector('.mlPause').onclick=(e)=>{const on=host.Pause();e.target.textContent=on?T('range.melee.btnResume'):T('range.melee.btnPause');};
    this.root.querySelector('.mlPreview').onclick=()=>host.Preview(this.root.querySelector('.mlAnimation').value);
    this.root.querySelector('.mlTime').oninput=e=>host.Preview(this.root.querySelector('.mlAnimation').value,Number(e.target.value));
    this.root.querySelector('.mlAssist').onchange=e=>host.SetAssist(e.target.value);
    this.root.querySelector('.mlResume').onclick=()=>host.Preview(null);
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
  }
  Update(snapshot) {
    if(!snapshot)return;
    this.root.hidden=!!snapshot.menu;
    const s=MELEE_SCENARIOS.find(s=>s.id===snapshot.scenario);
    if(this.currentScenario!==snapshot.scenario){this.currentScenario=snapshot.scenario;this.select.value=snapshot.scenario;this.select.onchange();}
    // 值没变就不写：每次 textContent 赋值都会让面板重排，空场景里没必要每 6 帧重排一次。
    const Put=(sel,text)=>{const el=this.root.querySelector(sel);if(el.textContent!==text)el.textContent=text;};
    Put('.mlPause',snapshot.paused?T('range.melee.btnResume'):T('range.melee.btnPause'));
    const f=snapshot.player, living=snapshot.targets.filter(t=>t.alive&&t.side==='ija');
    // 「共几组」照遭遇表数，不写死 —— 加一组标牌不该让面板继续说"六组"。
    Put('.mlStatus',!snapshot.alive?T('range.melee.statusDead')
      :s?.kind==='field'?T('range.melee.statusField',{done:snapshot.completed?.length||0,total:MELEE_ENCOUNTERS.length,
        state:snapshot.encounter?T('range.melee.statusEncounter'):snapshot.nearby||T('range.melee.statusApproach')})
      :!living.length?T('range.melee.statusCleared')
      :T('range.melee.statusRemain',{name:s?.name||'',living:living.length}));
    Put('.mlMeters',T('range.melee.meters',{
      weapon:snapshot.weapon==='Dadao'?T('range.melee.weaponDadao')
        :snapshot.stance==='melee'?T('range.melee.weaponBayonet'):T('range.melee.weaponRifle'),
      phase:PlayerPhase(f?.phase),
      parry:f?.parryActive?T('range.melee.parryWindow'):'',
      health:Math.round(snapshot.health),stamina:Math.round(f?.stamina??100),poise:Math.round(f?.poise??100)}));
    const shown=s?.kind==='field'?snapshot.targets.filter(t=>snapshot.encounter&&t.id.startsWith(snapshot.encounter+'_')):snapshot.targets;
    Put('.mlTargets',shown.length?shown.map(t=>T('range.melee.targetLine',{
      side:t.side==='nra'?T('range.melee.sideNra'):T('range.melee.sideIja'),id:t.id,
      body:!t.alive?T('range.melee.targetDown')
        :t.pose?.role?T('range.melee.targetAliveRole',{distance:t.distance.toFixed(2),
          health:Math.round(t.health),phase:TargetPhase(t.pose.phase),role:T(RoleKey(t.pose.role))})
        :T('range.melee.targetAlive',{distance:t.distance.toFixed(2),
          health:Math.round(t.health),phase:TargetPhase(t.pose?.phase)})})).join('\n')
      :T('range.melee.targetsIdle',{living:living.length}));
    Put('.mlLog',snapshot.events.slice(-5).reverse().map(e=>`${e.time.toFixed(1)} ${e.kind}${e.target!=null?' → '+e.target:''}`).join('\n'));
  }
  Dispose(){this.root.remove();document.body.classList.remove('meleeLabActive');}
}
