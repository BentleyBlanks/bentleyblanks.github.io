import {FeatherCapacity} from './Script_FeatherSweep.mjs?v=ear039-brush-gather-20260912';
import {ToolIcon} from './Script_ToolIcons.mjs?v=ear014-ui-20260912';
import {LAMP_LEVELS, COLLECTION_GRADES} from './Data_Progression.mjs?v=ear050-career-care-20261022';
// Career counter: collections sell here, then proceeds buy actual equipment.
export function CreateInstrumentShop({app, shop, view, Cancel, Sound, UpdateInventory}) {
  const names = {scoop: '耳勺', feather: '鹅绒清屑掸', brush: '柔毛刷', drops: '软化滴管', tweezers: '精细耳镊', suction: '微型吸引管'};
  const ids = {scoop: 'earPickBamboo', tweezers: 'earForceps', drops: 'earDrops', brush: 'softBrush', suction: 'microSuction', feather: 'gooseFeather'};
  const types = {dry: '干片', wet: '黏块', impacted: '硬结', oily: '油垢'};
  const editions = ['基础旧款', '保养翻新', '精加工', '精密升级', '专业典藏'];
  const benefits = {scoop: '圆润薄勺沿，贴边托起更省力。', tweezers: '细齿夹面与柔弹镊臂，夹持更稳定；长工作端可进入弯道深部。', drops: '圆口细管与定量刻线，软化牢固附着后再慢慢取出。', brush: '刷毛短扫，把细碎屑扫松、扫拢，再换鹅绒掸点取带走。', suction: '圆润细管吸入软化后的碎片，收入滤芯；按实际保存完整度估价。', feather: '绒羽带走碰到的微屑。升级增加每次可带走的组数。'};
  let selected = 'scoop', tab = 'tools', preview, onClose = null;
  const Escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  app.insertAdjacentHTML('beforeend', `<dialog id="shop-dialog" aria-labelledby="shop-title"><header class="shop-hero"><div><span class="eyebrow">EAR CARE / COLLECTIONS</span><h2 id="shop-title">采耳小铺</h2><p>把保存完好的收藏换成积蓄，<br>添置器具，照顾下一位客人。</p></div><button id="shop-close" class="round-close" aria-label="离开小铺">✕</button><div class="shop-purse"><small>小铺积蓄</small><strong id="shop-coins"></strong></div></header><nav class="shop-nav" aria-label="小铺分区"><button data-shop-tab="collection">收藏兑换</button><button data-shop-tab="tools">器具陈列</button><button data-shop-tab="lighting">照明升级</button><button data-shop-tab="skins">握柄材质</button><button data-shop-tab="room">我的小铺</button></nav><div class="shop-content"><div class="shop-caption"><strong id="shop-name"></strong><span id="shop-reputation"></span></div><div id="shop-offers"></div><p id="shop-message" role="status" aria-live="polite"></p></div></dialog>`);
  const $ = id => document.getElementById(id), dialog = $('shop-dialog');
  function Message(text) {$('shop-message').textContent = text;}
  function Buy(action, message) {
    const result = action();
    if (result?.ok) {Sound('uiConfirm', .65); UpdateInventory(); Refresh(); Message(typeof message === 'function' ? message(result) : message);}
    else Message('暂时无法完成，请查看解锁条件与积蓄。');
  }
  function Collection(host, snap) {
    const items = snap.collection.slice().sort((a, b) => b.grade - a.grade || b.value - a.value);
    host.innerHTML = `<article class="collection-summary room-card"><span class="eyebrow">COLLECTION / EXCHANGE</span><h3>${items.length ? items.length + ' 件待售收藏' : '收藏柜还空着'}</h3><p>取出越困难、保存越完整，等级与售价越高。碎裂后收齐仍能完成服务，完整度按最大的一片计算。</p><div class="collection-grade-key">${COLLECTION_GRADES.map(grade => `<span data-grade="${grade.grade}">${grade.grade}级 · ${grade.name}</span>`).join('')}</div><div class="room-numbers"><span>待售总值 <b>${snap.collectionValue}</b> 枚</span><span>已兑换 <b>${snap.collectionEarned}</b> 枚</span></div><button class="shop-buy" data-sell-all ${items.length ? '' : 'disabled'}>${items.length ? '全部兑换 · +' + snap.collectionValue + ' 枚' : '完成服务后，收藏会保存在这里'}</button><p>可以逐件兑换，也可以留下喜欢的珍藏。收藏与售出记录都会保存；练习不产生金币。</p></article><div class="collection-grid">${items.map(item => `<article class="collection-card" data-grade="${item.grade}" data-collection-id="${Escape(item.id)}"><span class="collection-emblem" aria-hidden="true">${item.sparkle ? '✦' : '◇'}</span><div><span class="eyebrow">${item.grade}级 · ${Escape(item.gradeName)}</span><h4>${types[item.type] || '耳垢'}${item.fragmented ? ' · 碎片组' : ''}</h4><p>完整度 ${Math.round(item.integrity * 100)}% · ${item.pieces} 片<br>第 ${item.day} 天 · ${Escape(item.customerName)}</p></div><button class="shop-buy" data-sell-collection="${Escape(item.id)}">兑换 +${item.value} 枚</button></article>`).join('')}</div>`;
    host.querySelector('[data-sell-all]').onclick = () => Buy(() => shop.SellAllCollection(), result => `已兑换 ${result.count} 件收藏，收入 ${result.payout} 枚。`);
    host.querySelectorAll('[data-sell-collection]').forEach(button => button.onclick = () => Buy(() => shop.SellCollection(button.dataset.sellCollection), result => `这件收藏已兑换，收入 ${result.payout} 枚。`));
  }
  function Lighting(host, snap) {
    const offer = shop.LampOffer(), lamp = LAMP_LEVELS[snap.lampLevel - 1];
    host.innerHTML = `<article class="room-card"><span class="eyebrow">LIGHTING / DESK LAMP</span><h3>${lamp.name}</h3><p>台灯固定在耳口旁，需要手动调整方向。更明亮的灯让深处更清楚；随动灯需单独装到高级器具上。</p><div class="edition-steps">${LAMP_LEVELS.map(item => `<span class="${item.level <= snap.lampLevel ? 'reached' : ''}"><i>${item.level}</i>${item.name}</span>`).join('')}</div><button class="shop-buy" data-upgrade-lamp ${offer.affordable ? '' : 'disabled'}>${offer.maxed ? '台灯已升至最高级' : offer.cost + ' 枚 · 升级为' + offer.name}</button></article><div class="collection-grid light-upgrades">${['scoop', 'tweezers', 'suction'].map(id => {
      const light = shop.ToolLightOffer(id);
      return `<article class="collection-card"><div>${ToolIcon(id)}<h4>${names[id]} · 随动灯</h4><p>装备后光线随工作端移动。<br>${light.owned ? '已安装，切换此器具时生效。' : light.unlocked ? '器具已达到安装条件。' : '需拥有此器具，并升级至工艺 3 级。'}</p></div><button class="shop-buy" data-tool-light="${id}" ${light.affordable ? '' : 'disabled'}>${light.owned ? '已装配' : light.cost + ' 枚 · 安装'}</button></article>`;
    }).join('')}</div>`;
    host.querySelector('[data-upgrade-lamp]').onclick = () => Buy(() => shop.UpgradeLamp(), '台灯已变亮，仍可手动调整方向。');
    host.querySelectorAll('[data-tool-light]').forEach(button => button.onclick = () => Buy(() => shop.BuyToolLight(button.dataset.toolLight), '随动灯已装好，使用这件器具时会随工作端移动。'));
  }
  function Refresh() {
    const snap = shop.Snapshot(), inv = snap.inventory;
    $('shop-name').textContent = snap.shopName; $('shop-coins').textContent = snap.coins + ' 枚';
    $('shop-reputation').textContent = '已照顾 ' + snap.totalCustomers + ' 位客人 · 口碑 ' + snap.reputation;
    for (const button of dialog.querySelectorAll('[data-shop-tab]')) button.setAttribute('aria-pressed', String(tab === button.dataset.shopTab));
    const host = $('shop-offers'); preview?.Dispose(); preview = null; Message('');
    if (tab === 'collection') {Collection(host, snap); return;}
    if (tab === 'lighting') {Lighting(host, snap); return;}
    if (tab === 'room') {
      const offer = shop.ShopOffer();
      host.innerHTML = `<article class="room-card"><span class="eyebrow">工作间 / 配置升级</span><h3>${offer.maxed ? '老字号采耳' : offer.name}</h3><p>添置器具收纳与舒适躺椅，让更多客人愿意常来。</p><div class="room-numbers"><span>营业第 <b>${snap.day}</b> 天</span><span>累计收入 <b>${snap.totalEarned}</b> 枚</span></div><p>升级后增加每日客源，提高基本服务费。台灯亮度在「照明升级」中单独添置。</p><button data-upgrade="shop" class="shop-buy" ${offer.affordable ? '' : 'disabled'}>${offer.maxed ? '已是老字号' : offer.cost + ' 枚 · 布置小铺'}</button></article>`;
      host.querySelector('[data-upgrade]').onclick = () => Buy(() => shop.UpgradeShop(), '工作间配置已更新。'); return;
    }
    const level = shop.ToolLevel(ids[selected]), owned = inv.tools.includes(selected), next = Math.min(5, level + 1);
    host.innerHTML = `<div class="cabinet-tabs">${Object.keys(names).map(id => `<button data-skin-tool="${id}" data-select-tool="${id}" aria-pressed="${selected === id}">${ToolIcon(id)}${names[id]}${inv.tools.includes(id) ? '' : '<small>待添置</small>'}</button>`).join('')}</div><article class="tool-showcase"><div class="preview-stage"><canvas id="tool-preview" aria-label="${names[selected]}当前与升级后的真实三维外观"></canvas><div class="preview-labels"><span>${owned ? '正在使用' : '基础器具'} · ${editions[level - 1]}</span><span>${tab === 'skins' ? '所选握柄材质' : level < 5 ? '下一阶 · ' + editions[next - 1] : '已至臻品'}</span></div><div class="preview-controls" aria-label="器具观察距离"><button data-preview-view="full" aria-pressed="true">全貌</button><button data-preview-view="tip" aria-pressed="false">工作端</button><button data-preview-view="grip" aria-pressed="false">握柄</button></div><small class="preview-hint">拖动旋转 · 检查真实三维器形</small></div><div class="tool-story"><span class="eyebrow">${tab === 'skins' ? '握柄 / 表面材质' : '工具 / 工艺等级'}</span><h3>${names[selected]}</h3><p>${benefits[selected]}</p><div class="edition-steps">${editions.map((name, i) => `<span class="${owned && i < level ? 'reached' : ''}"><i>${i + 1}</i>${name}</span>`).join('')}</div><div id="tool-actions"></div></div></article>`;
    const actions = $('tool-actions');
    if (!owned) {
      const item = shop.ToolOffer(selected);
      actions.innerHTML = `<p class="upgrade-benefit">${item.detail}</p>${item.requirement ? `<p class="saving-note">${item.requirement}</p>` : ''}<button class="shop-buy" data-purchase="${selected}" ${item.affordable ? '' : 'disabled'}>${item.cost} 枚 · 添置${item.name}</button>`;
      actions.querySelector('button').onclick = () => Buy(() => shop.BuyTool(selected), '新的器具已经放进工具架。');
    } else if (tab === 'tools') {
      const offer = shop.ToolUpgradeOffer(ids[selected]), light = shop.ToolLightOffer(selected);
      actions.innerHTML = `<p class="upgrade-benefit">${level < 5 ? `${editions[level - 1]} → ${editions[next - 1]}<br><small>${selected === 'feather' ? '单次容量 ' + FeatherCapacity(level) + ' → ' + FeatherCapacity(next) + ' 组微屑' : selected === 'drops' ? '软化渗透量增加' : '施力效率 +8%'}</small>` : selected === 'feather' ? '每次点扫最多带走 12 组微屑。' : '精密工作端与完整表面工艺。'}</p><button class="shop-buy" data-upgrade="${ids[selected]}" ${offer.affordable ? '' : 'disabled'}>${offer.maxed ? '已拥有典藏臻品' : offer.cost + ' 枚 · 升级器具'}</button>${!offer.affordable && !offer.maxed ? `<small class="saving-note">再积攒 ${Math.max(0, offer.cost - snap.coins)} 枚，就能升级。</small>` : ''}${light.eligible ? `<p class="saving-note">${light.owned ? '此器具已装备随动灯。' : '工艺 3 级后，可在「照明升级」安装随动灯。'}</p>` : ''}`;
      actions.querySelector('button').onclick = () => Buy(() => shop.UpgradeTool(ids[selected]), '器具已升级，下一次接触会更顺手。');
    } else {
      actions.innerHTML = `<p class="upgrade-benefit">工作尖端保留原有材质，握柄换上喜欢的触感。</p><div class="skin-grid"><button data-equip-classic><i class="swatch-classic"></i>原色<small>${!inv.equipped[selected] || inv.equipped[selected] === 'classic' ? '已装备' : '免费装备'}</small></button>${['walnut', 'jade'].map(id => {const item = shop.SkinOffer(selected, id); return `<button data-skin="${id}" ${item.affordable ? '' : 'disabled'}><i class="swatch-${id}"></i>${item.name}<small>${item.equipped ? '已装备' : item.owned ? '装备' : item.cost + ' 枚购入'}</small></button>`;}).join('')}</div>`;
      actions.querySelector('[data-equip-classic]').onclick = () => {shop.EquipSkin(selected, 'classic'); UpdateInventory(); Refresh();};
      actions.querySelectorAll('[data-skin]').forEach(button => button.onclick = () => Buy(() => shop.BuySkin(selected, button.dataset.skin), '握柄材质已装配。'));
    }
    host.querySelectorAll('[data-select-tool]').forEach(button => button.onclick = () => {selected = button.dataset.selectTool; Refresh();});
    preview = view.CreateToolPreview?.($('tool-preview'), selected, level, tab === 'skins' ? level : next, inv.equipped[selected] || 'classic');
    host.querySelectorAll('[data-preview-view]').forEach(button => button.onclick = () => {preview?.SetView(button.dataset.previewView); host.querySelectorAll('[data-preview-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));});
  }
  dialog.querySelectorAll('[data-shop-tab]').forEach(button => button.onclick = () => {tab = button.dataset.shopTab; Refresh();});
  $('shop-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {preview?.Dispose(); preview = null; const callback = onClose; onClose = null; callback?.();});
  return {Open(nextTab = 'tools', options = {}) {Cancel(); tab = ['collection', 'tools', 'lighting', 'skins', 'room'].includes(nextTab) ? nextTab : 'tools'; onClose = options.onClose || null; if (!dialog.open) dialog.showModal(); Refresh();}, Close() {dialog.close();}, Refresh, get open() {return dialog.open;}};
}
