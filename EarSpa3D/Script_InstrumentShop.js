import {FeatherCapacity} from './Script_FeatherSweep.mjs?v=ear039-brush-gather-20260912';
import { ToolIcon } from './Script_ToolIcons.mjs?v=ear014-ui-20260912';
// 独立经营页：购买、升级与换材质共用原有存档，预览直接使用游戏工具模型。
export function CreateInstrumentShop({ app, shop, view, Cancel, Sound, UpdateInventory }) {
  const names={scoop:'耳勺',tweezers:'精细耳镊',drops:'软化滴管',brush:'柔毛刷',suction:'微型吸引管',feather:'鹅绒清屑掸'};
  const ids={scoop:'earPickBamboo',tweezers:'earForceps',drops:'earDrops',brush:'softBrush',suction:'microSuction',feather:'gooseFeather'};
  const editions=['基础旧款','保养翻新','精加工','精密升级','专业典藏'];
  const benefits={scoop:'圆润薄勺沿，贴边托起更省力',tweezers:'细齿夹面与柔弹镊臂，夹持更稳定',drops:'圆口细管与定量刻线，渗透更充分',brush:'按住拖动，把细碎屑扫到一起，再换鹅绒掸一次带走',suction:'圆润管口与精细握柄，清理湿屑更稳',feather:'绒羽贴住微屑后，按住右键旋扫，松手带出；触屏使用转向模式。升级增加每次可带走的组数'};
  let selected='scoop',tab='tools',preview;
  app.insertAdjacentHTML('beforeend',`<dialog id="shop-dialog" aria-labelledby="shop-title"><header class="shop-hero"><div><span class="eyebrow">EAR CARE / EQUIPMENT</span><h2 id="shop-title">器具工作台</h2><p>检查器形、表面工艺与工作端。<br>为下一次操作选择合适的器具。</p></div><button id="shop-close" class="round-close" aria-label="离开小铺">✕</button><div class="shop-purse"><small>小铺积蓄</small><strong id="shop-coins"></strong></div></header><nav class="shop-nav" aria-label="小铺分区"><button data-shop-tab="tools">器具陈列</button><button data-shop-tab="skins">握柄材质</button><button data-shop-tab="room">我的小铺</button></nav><div class="shop-content"><div class="shop-caption"><strong id="shop-name"></strong><span id="shop-reputation"></span></div><div id="shop-offers"></div><p id="shop-message" role="status" aria-live="polite"></p></div></dialog>`);
  const $=id=>document.getElementById(id),dialog=$('shop-dialog');
  function Message(text){$('shop-message').textContent=text;}
  function Buy(action,message){if(action()?.ok){Sound('uiConfirm',.65);UpdateInventory();Refresh();Message(message);} }
  function Refresh(){
    const snap=shop.Snapshot(),inv=snap.inventory;
    $('shop-name').textContent=snap.shopName;
    $('shop-coins').textContent=snap.coins+' 枚';
    $('shop-reputation').textContent='已照顾 '+snap.totalCustomers+' 位客人 · 口碑 '+snap.reputation;
    for(const b of dialog.querySelectorAll('[data-shop-tab]'))b.setAttribute('aria-pressed',String(tab===b.dataset.shopTab));
    const host=$('shop-offers');preview?.Dispose();preview=null;
    if(tab==='room'){
      const offer=shop.ShopOffer();
      host.innerHTML=`<article class="room-card"><span class="eyebrow">工作间 / 配置升级</span><h3>${offer.maxed?'专业器具工作间':offer.name}</h3><p>升级工作间的照明、器具收纳和躺椅配置。</p><div class="room-numbers"><span>营业第 <b>${snap.day}</b> 天</span><span>累计收入 <b>${snap.totalEarned}</b> 枚</span></div><p>升级后增加每日客源，并提高采耳工时费。</p><button data-upgrade="shop" class="shop-buy" ${offer.affordable?'':'disabled'}>${offer.maxed?'已是老字号':offer.cost+' 枚 · 布置小铺'}</button></article>`;
      host.querySelector('[data-upgrade]').onclick=()=>Buy(()=>shop.UpgradeShop(),'工作间配置已更新。');return;
    }
    const level=shop.ToolLevel(ids[selected]),owned=inv.tools.includes(selected),next=Math.min(5,level+1);
    host.innerHTML=`<div class="cabinet-tabs">${Object.keys(names).map(id=>`<button data-skin-tool="${id}" data-select-tool="${id}" aria-pressed="${selected===id}">${ToolIcon(id)}${names[id]}${inv.tools.includes(id)?'':'<small>待添置</small>'}</button>`).join('')}</div><article class="tool-showcase"><div class="preview-stage"><canvas id="tool-preview" aria-label="${names[selected]}当前与升级后的真实三维外观"></canvas><div class="preview-labels"><span>${owned?'正在使用':'基础器具'} · ${editions[level-1]}</span><span>${tab==='skins'?'所选握柄材质':level<5?'下一阶 · '+editions[next-1]:'已至臻品'}</span></div><div class="preview-controls" aria-label="器具观察距离"><button data-preview-view="full" aria-pressed="true">全貌</button><button data-preview-view="tip" aria-pressed="false">工作端</button><button data-preview-view="grip" aria-pressed="false">握柄</button></div><small class="preview-hint">拖动旋转 · 检查真实三维器形</small></div><div class="tool-story"><span class="eyebrow">${tab==='skins'?'握柄 / 表面材质':'工具 / 工艺等级'}</span><h3>${names[selected]}</h3><p>${benefits[selected]}</p><div class="edition-steps">${editions.map((name,i)=>`<span class="${i<level?'reached':''}"><i>${i+1}</i>${name}</span>`).join('')}</div><div id="tool-actions"></div></div></article>`;
    const actions=$('tool-actions');
    if(!owned){const item=shop.ToolOffer(selected);actions.innerHTML=`<p class="upgrade-benefit">${item.detail}</p><button class="shop-buy" data-purchase="${selected}" ${item.affordable?'':'disabled'}>${item.cost} 枚 · 添置${item.name}</button>`;actions.querySelector('button').onclick=()=>Buy(()=>shop.BuyTool(selected),'新的器具，已经放进工具架。');}
    else if(tab==='tools'){
      const offer=shop.ToolUpgradeOffer(ids[selected]);
      actions.innerHTML=`<p class="upgrade-benefit">${level<5?`${editions[level-1]} → ${editions[next-1]}<br><small>更洁净的表面、更精细的器形 · ${selected==='feather'?'单次容量 '+FeatherCapacity(level)+' → '+FeatherCapacity(next)+' 组微屑':selected==='drops'?'软化渗透量增加':'施力效率 +8%'}</small>`:selected==='feather'?'每次旋扫最多带走 12 组微屑。':'精密工作端与完整表面工艺。'}</p><button class="shop-buy" data-upgrade="${ids[selected]}" ${offer.affordable?'':'disabled'}>${offer.maxed?'已拥有典藏臻品':offer.cost+' 枚 · 升级器具'}</button>${!offer.affordable&&!offer.maxed?`<small class="saving-note">再积攒 ${offer.cost-snap.coins} 枚，就能带它回家。</small>`:''}`;
      actions.querySelector('button').onclick=()=>Buy(()=>shop.UpgradeTool(ids[selected]),'新器具已换好，下一次接触会更顺手。');
    }else{
      actions.innerHTML=`<p class="upgrade-benefit">工作尖端保留原有材质，握柄换上喜欢的触感。</p><div class="skin-grid"><button data-equip-classic><i class="swatch-classic"></i>原色<small>${!inv.equipped[selected]||inv.equipped[selected]==='classic'?'已装备':'免费装备'}</small></button>${['walnut','jade'].map(id=>{const item=shop.SkinOffer(selected,id);return`<button data-skin="${id}" ${item.affordable?'':'disabled'}><i class="swatch-${id}"></i>${item.name}<small>${item.equipped?'已装备':item.owned?'装备':item.cost+' 枚购入'}</small></button>`;}).join('')}</div>`;
      actions.querySelector('[data-equip-classic]').onclick=()=>{shop.EquipSkin(selected,'classic');UpdateInventory();Refresh();};
      actions.querySelectorAll('[data-skin]').forEach(b=>b.onclick=()=>Buy(()=>shop.BuySkin(selected,b.dataset.skin),'握柄材质已装配。'));
    }
    host.querySelectorAll('[data-select-tool]').forEach(b=>b.onclick=()=>{selected=b.dataset.selectTool;Refresh();});
    preview=view.CreateToolPreview?.($('tool-preview'),selected,level,tab==='skins'?level:next,inv.equipped[selected]||'classic');
    host.querySelectorAll('[data-preview-view]').forEach(b=>b.onclick=()=>{preview?.SetView(b.dataset.previewView);host.querySelectorAll('[data-preview-view]').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));});
  }
  dialog.querySelectorAll('[data-shop-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.shopTab;Refresh();});
  $('shop-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{preview?.Dispose();preview=null;});
  return {Open(){Cancel();dialog.showModal();Refresh();},Refresh,get open(){return dialog.open;}};
}
