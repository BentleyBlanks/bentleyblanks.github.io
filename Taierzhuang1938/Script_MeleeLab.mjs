// 独立战斗实验面板：只配置初始条件和显示规则状态，不代替玩家执行战斗。
import { MELEE_SCENARIOS, MELEE_ANIMATION_ACTIONS } from './Data_MeleeCombat.mjs';
const RoleLabel = {front:'正面牵制',flank:'侧翼'};
const StateLabel = {idle:'警戒',charge:'蓄力',windup:'起手',active:'接触有效',recovery:'收招',parry:'拨挡',push:'推架',stagger:'失衡',fall:'倒地',down:'倒地',rise:'起身',qte:'抵抗'};
export class MeleeLab {
  constructor(host) {
    this.host=host;
    document.body.classList.add('meleeLabActive');
    this.root=document.createElement('section'); this.root.className='meleeLab';
    this.root.setAttribute('aria-label','白刃战独立实验');
    this.root.innerHTML=`<div class="mlHeading"><b>白刃战实验场</b><span>大刀与刺刀</span></div>
      <label>独立战斗<select class="mlScenario" aria-label="独立战斗项目">${MELEE_SCENARIOS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
      <div class="mlButtons"><button class="mlStart">开始／重开</button><button class="mlPause">暂停对手</button></div>
      <p class="mlTip"></p><p class="mlControls">左键：轻击／蓄力重击<br>右键：瞬时拨挡 · F：贴身推架<br>僵持／倒地：连按 F · 1／3：切换武器<br><small>按住 Alt 操作面板 · 松开继续战斗</small></p>
      <output class="mlStatus" aria-live="polite"></output><div class="mlMeters"></div><div class="mlTargets"></div>
      <details><summary>动作检查</summary><label>动作<select class="mlAnimation">${MELEE_ANIMATION_ACTIONS.map(a=>`<option>${a}</option>`).join('')}</select></label><div class="mlButtons"><button class="mlPreview">播放敌我动作</button><button class="mlResume">恢复战斗</button></div><label>动作进度<input class="mlTime" type="range" min="0" max="1" step="0.01" value="0" aria-label="动作逐帧进度"></label><p>播放时暂停对手；拖动进度条定格。开始／重开恢复战斗。</p></details>
      <label>QTE 输入<select class="mlAssist"><option value="tap">标准 · 连按 F</option><option value="hold">辅助 · 长按 F</option><option value="auto">辅助 · 自动抵抗</option></select></label>
      <details><summary>最近交锋</summary><div class="mlLog"></div></details>`;
    document.body.append(this.root);
    this.select=this.root.querySelector('.mlScenario');
    this.currentScenario=this.select.value;
    this.root.querySelector('.mlStart').onclick=(e)=>{host.Start(this.select.value);e.currentTarget.blur();host.Focus?.();};
    this.root.querySelector('.mlPause').onclick=(e)=>{const on=host.Pause();e.target.textContent=on?'恢复对手':'暂停对手';};
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
    this.root.querySelector('.mlPause').textContent=snapshot.paused?'恢复对手':'暂停对手';
    const f=snapshot.player, living=snapshot.targets.filter(t=>t.alive&&t.side==='ija');
    this.root.querySelector('.mlStatus').textContent=!snapshot.alive?'本轮阵亡 · 可重开':!living.length?'本轮完成 · 可重开':`${s?.name||''}　剩余 ${living.length}`;
    this.root.querySelector('.mlMeters').textContent=`${snapshot.weapon==='Dadao'?'大刀':'刺刀'} · ${StateLabel[f?.phase]||f?.phase||'准备'}${f?.parryActive?'（窗口有效）':''}\n生命 ${Math.round(snapshot.health)} · 体力 ${Math.round(f?.stamina??100)} · 平衡 ${Math.round(f?.poise??100)}`;
    this.root.querySelector('.mlTargets').textContent=snapshot.targets.map(t=>`${t.side==='nra'?'友军':'日军'} ${t.id} · ${t.alive?`${t.distance.toFixed(2)}m · ${Math.round(t.health)}生命 · ${StateLabel[t.pose?.phase]||'警戒'}${t.pose?.role?' · '+RoleLabel[t.pose.role]:''}`:'已倒下'}`).join('\n');
    this.root.querySelector('.mlLog').textContent=snapshot.events.slice(-5).reverse().map(e=>`${e.time.toFixed(1)} ${e.kind}${e.target!=null?' → '+e.target:''}`).join('\n');
  }
  Dispose(){this.root.remove();document.body.classList.remove('meleeLabActive');}
}
