// Dedicated carriage crowd: never reused as a global battlefield crowd bed.
export const CARRIAGE_SOUND = Object.freeze({
  preset: "firstLevelCarriage",
  crowdBed: "carriageCrowd",
  cheerCue: "amb.carriageRearCheer",
  trainGain: 1.15,
  crowdGain: 0.8,
  uneasyScale: 0.38,
  cheerVolume: 1.5,
  cheerSlots: [22, 23],
  reactions: [
    {id:"CarriageLaughAtTasting",line:7},
    {id:"CarriageLaughAtCounting",line:13},
  ],
  uneasyLine: 17,
});

export const CARRIAGE_SOUND_ASSETS = Object.freeze([
  {
    id:"carriageCrowd",file:"AudioAmb_CarriageCrowd.mp3",kind:"bed",targetLufs:-24,
    prompt:"生成约四十秒连续的拥挤军列车厢人群环境声，只要人群和随身器物，不要火车轮轨、不加音乐。1938年，四十名四川成年男兵挤坐在木质车厢，听点在中间乘客座位。六到十个不同成年男声在四周同时低声闲聊，前后几拨人各聊各的，持续可闻的人声嘈杂，不能轮流说一句再完全安静。口音是四川汉语，远近不同，七八米外后排男人的声音更闷、反射更多。每隔几秒有两三个人不整齐地嘿嘿笑、短促哈哈笑、起哄的喔声和应和的哎声，热闹但不是酒馆狂欢、不是看球欢呼。听得出多人喉音和含混的说话节奏，不突出任何完整长句，不读旁白，不让一个声音独占。间杂压低的咳嗽、搪瓷水壶杯口小碰声、衣服摩擦、鞋底挪动。全段始终有活的人群底，不留大段静音。结尾自然仍在交谈。禁止英语、女性、儿童、广播、枪炮、歌唱、整齐喊口号和音乐。",
  },
  {
    id:"carriageRearCheer",file:"AudioAmb_CarriageRearCheer.mp3",kind:"cue",targetLufs:-20,
    prompt:"生成一段六到八秒的完整多人反应音，只录人声，没有环境底和音乐。1938年中国军列，五六个四川成年男兵坐在听者后方七八米，听到前排同伴拿偷吃腊肉找借口，几个人先后爆出善意的起哄、闷笑和哈哈大笑，有人拉长一声哎哟，有人笑着应一声就是嘛，又有人短促喔一声。声音互相搭着、前后错开，有人笑得响有人含在嘴里笑，像整排人被逗乐后很快各忙各的。必须是一小群不同成年男子同时存在，明显比贴耳对白远，木车厢里短而密的反射，声音略闷但笑声清楚。不要单人录音、不要合唱、不要掌声、不要体育场欢呼、不要夸张喜剧罐头笑声，不要念说明，不加其他完整句子。完整反应一次演完，约七秒自然收住。",
  },
]);
