export const characterDefinitions = Object.freeze({
  Liang: Object.freeze({ id: "Liang", name: "梁穗儿", role: "18岁 · 青槐庄磨坊帮工" }),
  Mother: Object.freeze({ id: "Mother", name: "梁桂芬", role: "梁穗儿的母亲" }),
  Brother: Object.freeze({ id: "Brother", name: "小栓", role: "9岁 · 梁穗儿的弟弟" }),
  Zhou: Object.freeze({ id: "Zhou", name: "周文嫂", role: "县交通员 · 中共党员" }),
  He: Object.freeze({ id: "He", name: "贺木匠", role: "民兵负责人" }),
  Chen: Object.freeze({ id: "Chen", name: "陈叔", role: "磨坊邻人" }),
  Narrator: Object.freeze({ id: "Narrator", name: "青槐庄记事", role: "旁白" }),
});

export const historicalFrame = Object.freeze({
  place: "华北敌后 · 虚构的青槐庄",
  date: "1942年5月",
  statement: "本作使用虚构村庄与复合人物。背景取材于1942年前后日本侵略军在华北占领区实施的“治安强化”、封锁、抢掠、拘捕、杀害与纵火。故事不复刻具体受害者，也不把苦难换算成分数。",
  boundary: "八路军、地方党组织、民兵与普通群众并非无所不能。他们缺粮、缺药、缺枪弹，必须把保存群众放在争夺阵地之前。游戏聚焦敌后战场的一角，不代替抗日战争全貌。",
});

export const prologueCards = Object.freeze([
  Object.freeze({
    eyebrow: "华北敌后 · 1942年5月",
    title: "青槐庄没有出现在地图上",
    body: "只有四十七户人家，一盘磨、一条水渠，和一把每天都要用的门钥匙。",
  }),
  Object.freeze({
    eyebrow: "你不是一名士兵",
    title: "你叫梁穗儿，十八岁",
    body: "你会认粮的成色，会在黑暗里摸到磨坊暗门；你不会打枪，也不知道今天还能不能回家。",
  }),
  Object.freeze({
    eyebrow: "内容提示",
    title: "侵略、抢掠、纵火与非画面化死亡",
    body: "本作从幸存者视角呈现战争暴行及其后果，不提供刑讯操作、血腥特写、爆头或击杀榜。可在暂停菜单降低枪炮声与镜头震动。",
  }),
]);

export const chapters = Object.freeze({
  Breakfast: Object.freeze({
    number: "第一章",
    title: "一碗稀粥",
    time: "清晨 05:42",
    objective: "做完磨坊里每天都要做的三件小事。",
    hint: "跟随米黄色记号。靠近后按 F 或点“动作”。",
    opening: Object.freeze([
      ["Narrator", "天刚亮，磨盘已经转了半个时辰。最后一斗谷子里，三成要留作种粮。"],
      ["Mother", "先给小栓把鞋补上。今天去地里，露脚趾要扎破的。"],
    ]),
  }),
  Choice: Object.freeze({
    number: "第二章",
    title: "没响完的铜锣",
    time: "上午 08:17",
    objective: "三样东西只能带走两样，再进入磨盘下的地窖。",
    hint: "药箱、种粮、交通册没有“正确答案”；你选择的是往后的代价。",
    opening: Object.freeze([
      ["Narrator", "狗先不叫了。远处传来卡车压过石桥的声音，铜锣只敲了两下。"],
      ["Zhou", "日军扫荡队从南岗进村。先带人，东西能烧。穗儿，你最多背两件。"],
      ["Zhou", "我去叫西巷。你拿好就进磨盘下边，带小栓别出声。"],
    ]),
  }),
  Cellar: Object.freeze({
    number: "第三章",
    title: "墙那边",
    time: "上午 08:31",
    objective: "压住松动的木板，陪小栓等脚步过去。",
    hint: "按住空格或屏幕按钮。松开太久会让木板弹响，但不会重复播放暴行。",
    opening: Object.freeze([
      ["Brother", "姐，外边是来买粮的吗？"],
      ["Liang", "别问。跟着我数磨齿，一、二、三……"],
    ]),
  }),
  Rescue: Object.freeze({
    number: "第四章",
    title: "把人带出去",
    time: "上午 09:06",
    objective: "沿熟悉的村巷找到三组幸存者，把他们带到水渠口。",
    hint: "同一条路已经变了。找到人以后放慢脚步，别把他们丢在身后。",
    opening: Object.freeze([
      ["Narrator", "脚步远了。地窖口烫手，磨坊的梁在响。你先把小栓推了出去。"],
      ["Narrator", "陈叔倒在院墙外，周文嫂用一张苇席盖住了他。席角压着他早上还用过的磨刀石袋。"],
      ["Zhou", "西巷还有人。贺木匠他们只有五支旧枪，挡不了多久。我们带人走水渠。"],
    ]),
  }),
  Battle: Object.freeze({
    number: "第五章",
    title: "沟那边在打仗",
    time: "上午 09:24",
    objective: "穿过交叉火力送出口信，推板车，再打开渠门。",
    hint: "卧倒、贴墙、看弹着。民兵负责战斗，你负责让撤离窗口多撑一会儿。",
    opening: Object.freeze([
      ["He", "五支枪，二十九发子弹。我们不守村，只挡到最后一船过苇荡。"],
      ["He", "东沟小组从老渠底撤，我去接他们。"],
      ["Liang", "不能走老渠。昨夜那段土帮塌了，板车过不去。走枣树墙后的羊道，我小时候天天钻。"],
      ["Zhou", "听穗儿的。她认得这条沟。你告诉东沟小组：敌人压到磨坊了，等渠水起来，从羊道撤，不要恋战。"],
      ["Liang", "我要是路上碰见枪呢？"],
      ["He", "趴下。你送到的这句话，比多打一枪要紧。"],
    ]),
  }),
  Reeds: Object.freeze({
    number: "第六章",
    title: "过苇荡",
    time: "上午 09:41",
    objective: "拉三次渡绳，把最后三船人送进苇荡。",
    hint: "每一船都要等绳索回到手里。听见枪声，不要松绳。",
    opening: Object.freeze([
      ["Mother", "钥匙呢？"],
      ["Liang", "还挂在门上。"],
      ["Mother", "那就没带走。先拉绳。"],
    ]),
  }),
  Epilogue: Object.freeze({
    number: "尾声",
    title: "一把没带走的钥匙",
    time: "黄昏",
    objective: "点名。",
    hint: "战争没有在这里结束。今天被保住的，只是一小群具体的人。",
    opening: Object.freeze([
      ["Zhou", "梁桂芬。"],
      ["Mother", "到。"],
      ["Zhou", "梁小栓。"],
      ["Brother", "到。"],
      ["Zhou", "陈守义。"],
      ["Narrator", "苇荡里没有人应声。周文嫂没有划掉名字，只在旁边写下：青槐庄磨坊，未归。"],
      ["Brother", "姐，咱家还回得去吗？"],
      ["Zhou", "先把人记下来。地还在，明年还得种。"],
    ]),
  }),
});

export const interactionCopy = Object.freeze({
  Mill: Object.freeze({
    label: "推完最后半圈磨",
    dialogue: Object.freeze([
      ["Liang", "今年的麦粒比去年瘦。"],
      ["Mother", "人也瘦。磨细一点，小栓咽得下。"],
    ]),
  }),
  Bowl: Object.freeze({
    label: "把稀粥端给母亲",
    dialogue: Object.freeze([
      ["Mother", "我吃过了。"],
      ["Liang", "锅沿是干的。"],
      ["Mother", "……那就一人一半。"],
    ]),
  }),
  Shoe: Object.freeze({
    label: "给小栓补鞋",
    dialogue: Object.freeze([
      ["Brother", "周先生的草鞋也补了三层。"],
      ["Zhou", "我的还能走。把这根麻绳省给孩子。"],
    ]),
  }),
  Medicine: Object.freeze({
    label: "背上卫生所药箱",
    detail: "能保住磺胺、纱布和半瓶碘酒；来年的播种或交通线会付出代价。",
  }),
  Seed: Object.freeze({
    label: "背上七斤谷种",
    detail: "能保住来年的一小片地；救护或联络会付出代价。",
  }),
  Register: Object.freeze({
    label: "藏好交通册",
    detail: "能保住二十三个交通点的代号；药品或谷种会付出代价。",
  }),
  Cellar: Object.freeze({
    label: "进入磨盘下的地窖",
  }),
  Family: Object.freeze({
    label: "扶起母亲和小栓",
    dialogue: Object.freeze([
      ["Mother", "小栓的脚崴了。你别背我，牵着就行。"],
      ["Brother", "我能走。我不哭。"],
    ]),
  }),
  AuntSun: Object.freeze({
    label: "救出孙兰贞一家",
    dialogue: Object.freeze([
      ["Narrator", "孙婶怀里抱着三岁的满囤，身后是六岁的石丫和十二岁的长生。三个孩子一个也没松开她的衣角。"],
      ["Liang", "跟紧我。水渠边有一段墙能挡子弹。"],
    ]),
  }),
  Zhou: Object.freeze({
    label: "扶起周文嫂",
    dialogue: Object.freeze([
      ["Zhou", "先把药给孩子。电台摔坏了就摔坏了，人得走。"],
      ["Liang", "你腿上全是血。"],
      ["Zhou", "弹片擦的，还能走。别停在门口。"],
    ]),
  }),
  Canal: Object.freeze({
    label: "把这一组人送进水渠",
  }),
  Message: Object.freeze({
    label: "把口信送到东沟小组",
    dialogue: Object.freeze([
      ["Liang", "敌人压到磨坊。等渠水起来就撤，不要恋战。"],
      ["He", "收到。你沿板车后边回，土墙能挡机枪。"],
    ]),
  }),
  Cart: Object.freeze({
    label: "把伤员板车推出火线",
  }),
  Gate: Object.freeze({
    label: "打开渠门",
    dialogue: Object.freeze([
      ["Narrator", "渠水漫过干沟，尘土变成泥。追来的卡车慢了，渡船多出不到两分钟。"],
      ["He", "够了！东沟组，撤！"],
    ]),
  }),
  Ferry: Object.freeze({
    label: "握紧渡绳",
  }),
});

export const cellarSequence = Object.freeze([
  Object.freeze({ at: 1.4, speaker: "Narrator", text: "院门被踹开。粮斗倒在地上，麦粒滚进门缝。" }),
  Object.freeze({ at: 4.2, speaker: "Brother", text: "木板在动……" }),
  Object.freeze({ at: 7.1, speaker: "Narrator", text: "有人被拖到院里盘问。陈叔说粮已经交过，随后是一记枪声。" }),
  Object.freeze({ at: 10.2, speaker: "Narrator", text: "火落在苫草上。脚步离开时，磨盘还在慢慢转。" }),
]);

export const epilogueLines = Object.freeze({
  Medicine: "药箱到了苇荡。卫生员先给三个孩子和周文嫂处理了伤口。",
  Seed: "七斤谷种没有被烧。母亲用衣角包出三粒，说等回来时先种在磨坊墙边。",
  Register: "二十三个交通点没有落入敌手。周文嫂把湿透的纸一张张贴在苇叶上晾干。",
  LostMedicine: "卫生所药箱留在村里。夜里，伤员只能分用最后几卷旧布。",
  LostSeed: "谷种没能带走。母亲说，明年开春再一粒一粒借。",
  LostRegister: "交通册被周文嫂在撤离前烧毁。二十三个联络点要重新核实，线路会沉默一阵。",
});
