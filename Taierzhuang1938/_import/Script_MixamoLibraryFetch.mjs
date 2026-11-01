// Mixamo 下载结果 → 本地 FBX + 预览工具清单。
//
//   node Taierzhuang1938/_import/Script_MixamoLibraryFetch.mjs <log.json> <grabDir>
//
// Mixamo 的下载链接是 5 分钟有效的签名链接，网页安全策略又不让页面脚本连本机，所以下载走浏览器自己：
// 已登录的 mixamo.com 页面逐条导出、导出完立刻点下载，并记一条日志
// （{stem, cat, name, variant, of, id, desc, inplace, loopable, duration, clickAt}）；
// 本机另有程序把下载目录里新写完的 FBX 拷成 <grabDir>/Download_<首次出现毫秒>.fbx。
// 这里按时间把文件对回日志（每个文件归给它出现前最近一次、还没被认领的点击），
// 拷成 _import/Mixamo/Raw/<stem>.fbx（源文件），清单写 Animation/Mixamo/Data_MixamoLibrary.json，GLB 也在那里。
// 2026-11-01 起整套进仓库（用户要多台电脑都能用）：Mixamo 许可允许用在自己的游戏里，只是不许当独立素材转卖 / 分发。
// 之后跑 Script_MixamoLibraryBake.py 转 GLB。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTHORED, CURATE, DROP, HOLDS } from "./Data_MixamoLibraryCurate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.resolve(HERE, "..", "Animation", "Mixamo"); // GLB + 清单：预览工具与白盒编辑器读这里
const RAW = path.join(HERE, "Mixamo", "Raw");
const AUTHORED_DIR = path.join(HERE, "Mixamo", "Authored");

// 名字 → [中文名, 现有动作里它可以顶替谁（空 = 补缺口）]
const LABELS = {
  "Idle": ["站立待机", "站住不动的人（现在是开枪动作定格一帧 + 程序呼吸）"],
  "Breathing Idle": ["站立呼吸", "同上，UnarmedIdleA"],
  "Standing Idle": ["站立待机（变体）", "UnarmedIdleB"],
  "Unarmed Idle 01": ["空手待机", "UnarmedIdleA/B"],
  "Sad Idle": ["疲惫低头站", "疲惫站立"],
  "Neutral Idle": ["中性站立", "UnarmedIdleA/B"],
  "Looking Around": ["站着张望", "Script_ActorStandIdle 的扫视层"],
  "Rifle Idle": ["端枪站立待机", "RifleIdle / RifleIdleAlt（现在其实是单膝跪）"],
  "Rifle Aiming Idle": ["站姿瞄准待机", "AdvanceFire 定格"],
  "Idle Aiming": ["站姿瞄准", "AdvanceFire 定格"],
  "Walking": ["空手走", "缺 UnarmedWalk"],
  "Standard Walk": ["空手走（标准）", "缺 UnarmedWalk"],
  "Start Walking": ["起步走", "缺：走路起步过渡"],
  "Stop Walking": ["停步", "缺：走路停稳过渡"],
  "Walk With Rifle": ["端枪走", "缺 RifleLowReadyWalk"],
  "Rifle Walk": ["端枪走（戒备）", "缺 RifleLowReadyWalk"],
  "Rifle Walk To Stop": ["端枪走停", "缺：端枪走停稳"],
  "Sneak Walk": ["潜行走", "AllyGait 俯身走"],
  "Running": ["空手跑", "BackRifleRun（背枪跑，双手空）"],
  "Jog Forward": ["空手慢跑", "BackRifleRun / RelaxedGait 小跑"],
  "Rifle Run": ["端枪跑", "RifleRun / RifleHoldRun"],
  "Rifle Start Run": ["端枪起跑", "缺：起跑过渡"],
  "Rifle Run To Stop": ["端枪跑停", "缺：急停过渡"],
  "Rifle Stand To Kneel": ["端枪站→跪", "StandToKneel"],
  "Rifle Kneel Idle": ["端枪跪姿待机", "KneelHold / CrouchIdle（坏定格）"],
  "Rifle Kneel To Stand": ["端枪跪→站", "KneelToStand"],
  "Rifle Crouch Walk": ["端枪蹲走", "RifleCrouchAdvance / AllyGait 蹲走"],
  "Rifle Crouch Idle To Walk": ["蹲姿起步", "缺：蹲走起步"],
  "Rifle Crouch Walk To Idle": ["蹲走停步", "缺：蹲走停稳"],
  "Rifle Crouch Backward Walk": ["端枪蹲着后退", "缺：后退"],
  "Rifle Idle To Crouch": ["端枪站→蹲", "缺：站蹲过渡"],
  "Crouch To Standing With Rifle": ["端枪蹲→站", "缺：蹲站过渡（车厢起身 FL21）"],
  "Idle Crouching Aiming": ["蹲姿瞄准", "CrouchFire / CrouchFireAlt（坏，现别名到 RifleIdle）"],
  "Crouch Rapid Fire": ["蹲姿连射", "CrouchFire"],
  "Kneeling Idle": ["空手跪", "缺：空手跪（救护、查看伤员）"],
  "Crouch To Prone": ["蹲→卧倒", "缺：卧倒（FL05）"],
  "Prone Idle": ["卧姿待机", "StandFireCrouch（名实不符，其实是趴）"],
  "Prone Forward": ["匍匐前进", "ProneCrawl"],
  "Prone Firing Rifle": ["卧姿射击", "ProneFire（名实不符，其实是站着甩臂）"],
  "Prone Reloading": ["卧姿换弹", "缺"],
  "Rifle Kneel To Prone": ["跪→卧", "缺"],
  "Rifle Prone To Kneel": ["卧→跪", "缺：卧起"],
  "Prone To Crouch Transition": ["卧→蹲", "缺：卧起"],
  "Crawling": ["爬行（手膝）", "ProneCrawl 备选"],
  "Low Crawl": ["低姿匍匐", "ProneCrawl"],
  "Prone Roll": ["卧姿侧滚", "缺"],
  "Firing Rifle": ["站姿射击", "AdvanceFire / StandFireCrouchAlt"],
  "Shoot Rifle": ["站姿开枪", "AdvanceFire"],
  "Fire Rifle": ["站姿开火", "AdvanceFire"],
  "Reloading": ["换弹", "缺：NPC 换弹（FL06）"],
  "Reload": ["换弹（变体）", "缺：NPC 换弹"],
  "Rifle Aim To Down": ["收枪放低", "缺：瞄准↔低姿过渡"],
  "Rifle Down To Aim": ["举枪瞄准", "缺：瞄准↔低姿过渡"],
  "Grenade Throw": ["投手榴弹", "GrenadeThrow"],
  "Toss Grenade": ["抛手榴弹", "GrenadeThrow"],
  "Throw Grenade": ["扔手榴弹", "GrenadeThrow"],
  "Standing React Small From Front": ["受击·轻·前", "HitReaction 库"],
  "Standing React Small From Back": ["受击·轻·后", "HitReaction 库"],
  "Standing React Small From Left": ["受击·轻·左", "HitReaction 库"],
  "Standing React Small From Right": ["受击·轻·右", "HitReaction 库"],
  "Standing React Large From Front": ["受击·重·前", "HitReaction 库"],
  "Standing React Large From Back": ["受击·重·后", "HitReaction 库"],
  "Standing React Large From Left": ["受击·重·左", "HitReaction 库"],
  "Standing React Large From Right": ["受击·重·右", "HitReaction 库"],
  "Rifle Hit To Back": ["端枪中弹后仰", "HitReaction 库"],
  "Rifle Kneel Hit To Back": ["跪姿中弹", "HitReaction 库"],
  "Rifle Prone Hit Reaction": ["卧姿中弹", "HitReaction 库"],
  "Shoulder Hit And Fall": ["肩部中弹倒地", "HitReaction / 倒地"],
  "Standing React Death Forward": ["中弹倒地·向前", "DeathCollapse A–D（Kimodo）"],
  "Standing React Death Backward": ["中弹倒地·向后", "DeathCollapse A–D"],
  "Standing React Death Left": ["中弹倒地·向左", "DeathCollapse A–D"],
  "Standing React Death Right": ["中弹倒地·向右", "DeathCollapse A–D"],
  "Death From The Front": ["正面中弹死亡", "DeathCollapse"],
  "Death From The Back": ["背后中弹死亡", "DeathCollapse"],
  "Death From Front Headshot": ["正面爆头", "DeathCollapse"],
  "Death From Back Headshot": ["背后爆头", "DeathCollapse"],
  "Rifle Death": ["端枪中弹死亡", "DeathCollapse"],
  "Crouch Death": ["蹲姿死亡", "缺：蹲姿死亡"],
  "Death Crouching Headshot Front": ["蹲姿爆头", "缺：蹲姿死亡"],
  "Prone Death": ["卧姿死亡", "缺：卧姿死亡"],
  "Falling Back Death": ["仰面倒下", "DeathCollapse"],
  "Falling Forward Death": ["扑面倒下", "DeathCollapse"],
  "Rifle Run To Dying": ["跑动中弹扑倒", "缺：跑动中死亡"],
  "Dying": ["垂死倒下", "DeathCollapse"],
  "Injured Walk": ["伤员跛行", "WoundedLimp"],
  "Injured Idle": ["伤员站立", "缺 WoundedIdle"],
  "Injured Hurting Idle": ["伤员捂伤", "缺：捂臂（FL19）"],
  "Injured Stumble Idle": ["伤员踉跄", "缺"],
  "Laying Idle": ["躺着", "担架患者 / 老周卧姿"],
  "Fallen Idle": ["倒地躺着", "担架患者"],
  "Being Carried": ["被扛着", "缺：被背 / 被扛"],
  "Receiving Cpr": ["躺着被急救", "老周 / 伤员被救"],
  "Administering Cpr": ["跪着急救按压", "CollectionCare 医护按压"],
  "Kneeling Inspecting": ["跪着查看", "刘文财查看伤兵 / 医护检查"],
  "Grab Rifle From Back": ["从背上取枪", "缺（FL02 取枪）"],
  "Put Back Rifle Behind Shoulder": ["把枪背到背上", "缺（FL02 收枪）"],
  "Rifle Put Away": ["收枪", "缺（FL02）"],
  "Rifle Pull Out": ["拔枪/取枪", "缺（FL02）"],
  "Taking Cover Idle": ["掩体后蹲伏", "缺：来火蹲避（FL18）"],
  "Rifle Shielding Face": ["端枪护脸", "缺：近爆护头（FL05/18）"],
  "Crouch Look Around Corner": ["蹲着探头", "缺：墙角观察"],
  "Ducking": ["缩身躲避", "缺：来火缩回"],
  "Scared": ["受惊", "缺：百姓受惊"],
  "Bayonet Stab": ["刺刀突刺", "Melee 刺刀（日军）"],
  "Upward Rifle Butt Strike": ["枪托上挑", "Melee 枪托"],
  "Rifle Block": ["端枪格挡", "Melee 拨挡"],
  "Block With Rifle": ["横枪格挡", "Melee 拨挡"],
  "Rifle Punch": ["枪托砸", "Melee 枪托"],
  "Talking": ["站着说话", "SpeakerGestures / PvStandTalk*"],
  "Standing Arguing": ["争辩", "SpeakerGestures"],
  "Pointing": ["指方向", "PvStandPointL"],
  "Pointing Forward": ["向前指", "PvStandPointL"],
  "Kneeling Pointing": ["跪着指", "PvCrouchPointL"],
  "Beckoning": ["招手过来", "PvStandBeckonL"],
  "Waving": ["挥手", "PvStandWaveOnL"],
  "Charge": ["冲锋下令", "AttackCommand"],
  "Yelling": ["喊叫", "说话表演"],
  "Sitting Idle": ["坐着", "LeanWallSitPeek / PvSitRestRifle"],
  "Sitting Talking": ["坐着说话", "坐姿说话"],
  "Sit To Stand": ["坐→站", "缺：起身"],
  "Stand To Sit": ["站→坐", "缺：坐下"],
  "Sitting Dazed": ["坐着发懵", "缺：近爆后发懵"],
  "Sitting Rubbing Arm": ["坐着揉胳膊", "缺：伤兵捂臂坐（FL19）"],
  "Wheelbarrow Walk": ["推车走", "缺：推车（FL32）"],
  "Pull Heavy Object": ["拖重物", "缺：拖伤员（FL29）"],
  "Picking Up": ["弯腰捡起", "缺：捡枪 / 取物"],
  "Putting Down": ["弯腰放下", "缺：放下箱子"],
  "Climbing To Top": ["翻上高处", "PvClimbOutTrench 翻出壕沟"],
  "Climbing Ladder": ["爬梯子", "缺"],
  // 2026-10-31 第二批
  "Rifle Turn": ["端枪原地转身", "缺：转向停稳（FL03）"],
  "Rifle Crouch Turn": ["端枪蹲着转身", "缺：蹲姿转向"],
  "Turn 90 Left": ["左转 90°", "缺：空手转向"],
  "Turn 90 Right": ["右转 90°", "缺：空手转向"],
  "Backwards Rifle Walk": ["端枪后退走", "缺：后退（FL03）"],
  "Backwards Rifle Run": ["端枪后退跑", "缺：边打边退（FL03）"],
  "Rifle Side Step": ["端枪侧步", "缺：左右移动（FL03）"],
  "Left Strafe": ["向左侧移", "缺：左右移动"],
  "Right Strafe": ["向右侧移", "缺：左右移动"],
  "Crouch Walk Strafe Left": ["蹲着向左侧移", "缺：蹲姿左右移动"],
  "Crouch Walk Strafe Right": ["蹲着向右侧移", "缺：蹲姿左右移动"],
  "Sprint Forward": ["冲刺", "缺：冲刺"],
  "Crouched To Sprinting": ["蹲起冲刺", "缺：从掩体冲出去"],
  "Jump Over": ["跳过障碍", "缺：翻越"],
  "Vault Over Box": ["撑跳翻越", "缺：翻沙袋 / 矮墙"],
  "Jumping Down": ["跳下", "缺：下车 / 跳下壕沟（FL21）"],
  "Stand To Cover": ["站→贴掩体", "缺：进掩体"],
  "Cover Idle": ["贴掩体待机", "缺：掩体后待机"],
  "Cover To Stand": ["贴掩体→站", "缺：出掩体"],
  "Crouch Cover To Cover": ["蹲着掩体间转移", "缺：掩体间转移"],
  "Terrified": ["惊恐", "缺：百姓受惊（FL41）"],
  "Leaning On A Wall": ["靠墙站", "WallStandIdle（FL13 车厢靠墙）"],
  "One Shoulder Lean": ["单肩靠墙", "WallStandIdle（FL13）"],
  "Box Idle": ["抱箱站", "缺：抱药箱 / 弹药箱（FL42）"],
  "Box Walk Arc": ["抱箱走", "缺：抱箱走（FL42）"],
  "Box Turn": ["抱箱转身", "缺：抱箱转向"],
  "Lifting": ["搬起重物", "缺：抬箱子"],
  "Picking Up Object": ["捡起东西", "缺：捡枪 / 取物"],
  "Carrying": ["搬着走", "缺：搬运"],
  "Taking Item": ["接过东西", "缺：领枪领弹 / 接食（FL14/15）"],
  "Drinking": ["喝水", "缺：喝水"],
  "Helping Out": ["扶人起来", "缺：扶起（FL21）"],
  "Knocked Unconscious": ["被打晕倒地", "缺：近爆昏倒"],
  "Great Sword Idle": ["双手大刀待机", "Melee 大刀（双手刀顶替）"],
  "Great Sword Slash": ["双手大刀劈", "Melee 大刀劈砍"],
  "Great Sword Attack": ["双手大刀攻击", "Melee 大刀"],
  "Great Sword High Spin Attack": ["双手大刀旋劈", "Melee 大刀"],
  "Great Sword Blocking": ["双手大刀格挡", "Melee 大刀格挡"],
  "Great Sword Impact": ["双手大刀被击中", "Melee 大刀受击"],
  // 2026-10-31 第三批：换掉不合适的、补空手与端枪各缺的那一半
  "Unarmed Walk Forward": ["空手走", "缺 UnarmedWalk"],
  "Crouched Walking": ["猫腰走", "AllyGait 俯身走"],
  "Sneaking Forward": ["空手猫腰快走", "AllyGait 俯身走（百姓）"],
  "Crouch Walking": ["瞄准蹲走", "RifleCrouchAdvance"],
  "Unarmed Run Forward": ["空手跑", "BackRifleRun（背枪跑，双手空）"],
  "Fast Run": ["空手快跑", "缺：百姓逃跑"],
  "Sprint": ["空手冲刺", "缺：空手冲刺"],
  "Run Look Back": ["边跑边回头", "缺：百姓逃跑"],
  "Slow Run": ["空手慢跑", "RelaxedGait 小跑"],
  "Crouched Run": ["端枪猫腰跑", "AllyGait 俯身跑"],
  "Running Dive Roll": ["端枪跑动扑地翻滚", "缺：来火扑倒"],
  "Injured Run": ["伤员跑", "缺：伤员跑"],
  "Unarmed Walk Back": ["空手后退走", "缺：后退"],
  "Unarmed Run Back": ["空手后退跑", "缺：后退"],
  "Run Left": ["端枪向左跑", "缺：左右移动（FL03）"],
  "Run Right": ["端枪向右跑", "缺：左右移动（FL03）"],
  "Left Cover Sneak W/ Rifle": ["端枪贴墙向左挪", "缺：贴墙移动"],
  "Right Cover Sneak W/ Rifle": ["端枪贴墙向右挪", "缺：贴墙移动"],
  "Hit Reaction": ["受击", "HitReaction 库"],
  "Walking Hit Reaction": ["瞄准走动受击", "HitReaction 库"],
  "Getting Hit": ["背后挨打", "HitReaction 库"],
  "Walking To Dying": ["瞄准走中弹倒地", "缺：走动中死亡"],
  // 2026-10-31 第四批：投掷、背带取枪、按住伤员、扛人、拖重物
  "Run And Throw Grenade": ["边跑边投弹", "GrenadeThrow"],
  "Throw": ["站着甩臂投掷", "GrenadeThrow"],
  "Throwing": ["上手投掷", "GrenadeThrow"],
  "Throw Object": ["捡起来扔出去", "缺：捡起手榴弹扔回去"],
  "Grab Rifle From Behind Shoulder": ["从肩后取枪", "缺（FL02 取枪）"],
  "Grab And Put Back Rifle": ["从肩上取枪再背回去", "缺（FL02）"],
  "Put Back Rifle": ["收枪背回", "缺（FL02 收枪）"],
  "Holding Down": ["跪着按住伤员", "CollectionCare 医护（代替急救按压）"],
  "Injured Wave Idle": ["伤员挥手求救", "缺：伤员呼救"],
  "Walk To Stop": ["扛着人走→停", "缺：扛伤员"],
  "Carrying Turn": ["扛着人左转", "缺：扛伤员"],
  "Pull Heavy Object Start": ["开始拖重物", "缺：拖伤员 / 拖被子（FL29）"],
  "Pull Heavy Object Stop": ["拖重物→停", "缺：拖伤员 / 拖被子（FL29）"],
  "Wheelbarrow Idle": ["扶着推车站", "缺：推车（FL32）"],
  "Rifle Rubbing Eyes": ["端枪揉眼", "缺：近爆迷眼（FL05/18）"],
  "Fall Over": ["端枪慌乱摔倒", "缺：被震倒"],
  "Rifle Kneel To Aim": ["跪姿举枪瞄准", "KneelHold / 跪姿射击"],
  "Rifle Aim To Kneel": ["跪姿瞄准→放低", "KneelHold"],
};

const CATEGORY_ORDER = ["站立待机", "走", "跑", "转身与侧移", "蹲与跪", "卧倒与匍匐", "射击与换弹", "投弹", "受击", "死亡",
  "伤员与救护", "背枪与取枪", "躲避与掩护", "近战", "手势与说话", "坐", "搬运与拿取", "翻越与攀爬"];
// 第一批下载时的分类名在这里改口径；按动作名指定的优先。
const CATEGORY_RENAME = { "搬运与攀爬": "搬运与拿取" };
const CATEGORY_BY_NAME = { "Climbing To Top": "翻越与攀爬", "Climbing Ladder": "翻越与攀爬" };
const Category = clip => CATEGORY_BY_NAME[clip.name] || CATEGORY_RENAME[clip.category] || clip.category;

function Pascal(name) {
  return name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1)).join("");
}

function Stem(item) {
  return item.stem || `Animation_Mixamo_${Pascal(item.name)}_V${item.variant}`;
}

// 点击到文件出现一般 1–3 s；超过这个就当没对上，宁可漏也不张冠李戴。
const MAX_CLICK_TO_FILE_MS = 15000;

function MatchDownloads(log, grabDir) {
  const files = fs.readdirSync(grabDir)
    .map(name => ({ name, seen: Number(/^Download_(\d+)\.fbx$/.exec(name)?.[1]) }))
    .filter(file => file.seen).sort((a, b) => a.seen - b.seen);
  const clicks = [...log].sort((a, b) => a.clickAt - b.clickAt);
  const taken = new Set(), matched = [];
  for (const file of files) {
    let best = null;
    for (const click of clicks) {
      if (click.clickAt > file.seen + 500) break;
      if (!taken.has(click.stem)) best = click;
    }
    if (!best || file.seen - best.clickAt > MAX_CLICK_TO_FILE_MS) {
      console.warn(`[MixamoFetch] unmatched ${file.name}`);
      continue;
    }
    taken.add(best.stem);
    matched.push({ item: best, source: path.join(grabDir, file.name) });
  }
  return matched;
}

const ShortStem = file => file.replace(/^Animation_Mixamo_/, "").replace(/\.glb$/, "");

// 套整理表：DROP 里的标上 dropped（留在清单里，预览工具不显示；从 DROP 拿掉就回来），
// 其余按版本改中文名、持枪状态，必要时换分类和顶替说明。
// 表里没有的条目照留，持枪状态记成「未整理」并报出来，提醒补表。
function Curate(clips) {
  const kept = [], unlisted = [];
  for (const clip of clips) {
    clip.category = Category(clip);
    if (LABELS[clip.name]) [clip.label, clip.replaces] = LABELS[clip.name];
    const key = ShortStem(clip.file);
    for (const field of ["dropped", "prop", "note", "rifleHand"]) delete clip[field];
    if (DROP[key]) {
      clip.dropped = DROP[key];
      kept.push(clip);
      continue;
    }
    const entry = CURATE[key];
    if (entry) {
      const [hold, label, extra = {}] = entry;
      Object.assign(clip, { hold, label }, extra);
    } else {
      clip.hold = "未整理";
      unlisted.push(key);
    }
    kept.push(clip);
  }
  if (unlisted.length) console.warn(`[MixamoFetch] not in Data_MixamoLibraryCurate: ${unlisted.join(", ")}`);
  return kept.sort((a, b) => Boolean(a.dropped) - Boolean(b.dropped)
    || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    || HOLDS.indexOf(a.hold) - HOLDS.indexOf(b.hold)
    || a.label.localeCompare(b.label, "zh"));
}

// Claude 自制的动作：GLB 做出来了才进清单，每次整份重写（改了 AUTHORED 表重跑 --prune 就同步）。
// author / basedOn / sources 三项给预览工具显示「谁做的、改自哪条、源文件在哪」，以后迭代照着找。
function AuthoredClips(byFile) {
  const clips = [];
  for (let [key, spec] of Object.entries(AUTHORED)) {
    const file = `Animation_Claude_${key}.glb`;
    if (!fs.existsSync(path.join(LIBRARY, file))) continue;
    // 制作脚本导出时写的 Authored/<键>.meta.json：改自哪条（base）、制作说明（note → madeNote，预览里是普通一行，
    // 不是黄色「注意」——「注意」只留给 AUTHORED 表里手写的时代/用法提醒）、关键帧时间（timings）以它为准。
    const metaPath = path.join(AUTHORED_DIR, `${key}.meta.json`);
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
    spec = { ...spec, ...(meta.base ? { base: meta.base } : {}), ...(meta.note ? { madeNote: meta.note } : {}),
      ...(meta.timings ? { timings: meta.timings } : {}), ...(meta.loop !== undefined ? { loop: meta.loop } : {}) };
    const base = byFile.get(`${spec.base}.glb`);
    const { base: _, label, category, hold, loop = false, ...extra } = spec;
    clips.push({
      file, category, name: `Claude · ${key}`, label, variant: 1, variants: 1,
      description: base ? `基于 Mixamo「${base.label}」（${base.name} V${base.variant}）` : `基于 Mixamo ${spec.base}`,
      loop, inPlace: false, duration: null, replaces: extra.replaces || "", hold, ...extra,
      author: "Claude Opus 5.5", basedOn: spec.base,
      sources: [`Taierzhuang1938/_import/MixamoAuthored/Script_Author_${key}.py`, `Taierzhuang1938/_import/Mixamo/Authored/${key}.blend`],
    });
  }
  return clips;
}

function WriteManifest(manifestPath, clips) {
  const mixamo = clips.filter(clip => !clip.author);
  const curated = [...Curate(mixamo), ...AuthoredClips(new Map(mixamo.map(clip => [clip.file, clip])))].sort((a, b) =>
    Boolean(a.dropped) - Boolean(b.dropped)
    || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    || HOLDS.indexOf(a.hold) - HOLDS.indexOf(b.hold)
    || Boolean(b.author) - Boolean(a.author)
    || a.label.localeCompare(b.label, "zh"));
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema: 2, character: "Model_MixamoXBot.glb", source: "Mixamo X Bot, FBX 30 fps, without skin",
    categories: CATEGORY_ORDER, holds: HOLDS, clips: curated,
  }, null, 2));
  return curated;
}

// 转完 GLB 之后跑一次 `--prune`：清单里只留真有 GLB 的条目（没下全、转换失败的去掉，下次补下再加回来），
// 顺带重套一遍整理表。只改了整理表时也用它。
function Prune() {
  const manifestPath = path.join(LIBRARY, "Data_MixamoLibrary.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const kept = manifest.clips.filter(clip => fs.existsSync(path.join(LIBRARY, clip.file)));
  const missing = manifest.clips.filter(clip => !kept.includes(clip)).map(clip => clip.file);
  const curated = WriteManifest(manifestPath, kept);
  const shown = curated.filter(clip => !clip.dropped);
  const counts = HOLDS.map(hold => `${hold} ${shown.filter(clip => clip.hold === hold).length}`).join("，");
  console.log(`[MixamoFetch] prune: shown ${shown.length}（${counts}），dropped by curate ${curated.length - shown.length}`
    + `，no GLB ${missing.length}${missing.length ? ": " + missing.join(", ") : ""}`);
}

function Main() {
  if (process.argv[2] === "--prune") return Prune();
  const [input, grabDir] = process.argv.slice(2);
  if (!input || !grabDir) throw new Error("usage: node Script_MixamoLibraryFetch.mjs <log.json> <grabDir>");
  const log = JSON.parse(fs.readFileSync(input, "utf8"));
  fs.mkdirSync(RAW, { recursive: true });
  const manifestPath = path.join(LIBRARY, "Data_MixamoLibrary.json");
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { clips: [] };
  const clips = new Map(previous.clips.map(clip => [clip.file, clip]));
  let fetched = 0;
  for (const { item, source } of MatchDownloads(log, grabDir)) {
    const stem = Stem(item);
    fs.copyFileSync(source, path.join(RAW, `${stem}.fbx`));
    fetched += 1;
    const [label, replaces] = LABELS[item.name] || [item.name, ""];
    clips.set(`${stem}.glb`, {
      file: `${stem}.glb`, category: item.cat, name: item.name, label,
      variant: item.variant, variants: item.of, description: item.desc || "",
      loop: Boolean(item.loopable), inPlace: Boolean(item.inplace),
      duration: item.duration ?? null, replaces, mixamoId: item.id,
    });
  }
  const sorted = WriteManifest(manifestPath, [...clips.values()]);
  const missing = log.filter(item => !clips.has(`${Stem(item)}.glb`)).map(Stem);
  console.log(`[MixamoFetch] matched ${fetched} of ${log.length} logged, manifest ${sorted.length} clips`);
  if (missing.length) console.log(`[MixamoFetch] no file for: ${missing.join(", ")}`);
}

Main();
