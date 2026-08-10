export const BoardMeta = Object.freeze({
  title: "《地道里的光》剧情资产导演台",
  version: "2.1.0",
  projectId: "TL1943",
  chapterId: "PROLOGUE",
  chapterTitle: "序章 · 地上的日子",
  targetDuration: 120,
  resolution: "1280×720",
  frameRate: 30,
  defaultModel: "seedance2.0_vip",
  defaultResolution: "720p",
  legacyReviewVideo: "../Video/Pro_All.mp4?v=051",
  localBridgeUrl: "http://127.0.0.1:47821",
  storageKey: "tunnel_light_asset_director_v2",
  releaseStorageKey: "tunnel_light_asset_releases_v1",
  legacyStorageKey: "tunnel_light_video_board_v1",
});

export const StyleLockPrompt = "严格以输入参考图为构图、人物身份和服装依据。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄、灰蓝、暗褐，克制沉重。默认单一固定机位；除非本节点明确写明唯一的叙事必要运镜，否则禁止无意义推近、拉远、横移、纵移、旋转、俯仰、环绕和漂移。只允许叙事所需的人物、尘土、烟、灯火或纸张做小幅自然动作。不得转成写实摄影、3D、动漫或光滑数字插画；人物不变脸、不增人、不多肢。禁止字幕、可读文字、数字、乱码、UI、水印、钱币、现代建筑、现代车辆和现代器物。无音频。";

const SourceTaskRecords = Object.freeze({
  "1090a762-962e-42e0-a8c4-e2146ac52226": {
    label: "镜头01 · 地图推进",
    kind: "image2video",
    accepted: true,
    prompt: "固定正俯视构图，镜头绝不旋转、俯仰或环绕。保持原图20世纪50至60年代中国连环画墨线、交叉排线、旧纸纹与低饱和土黄灰蓝。无字旧地图的纸纹轻微呼吸，三道暗红侵略箭头依次从东北向华北缓慢推进，边界线稳定不漂移。禁止生成任何文字、数字、地名、现代地图标记、UI、水印或新物体。无音频。",
  },
  "965885ec-da6e-437d-8d27-25a5e9a86f85": {
    label: "镜头02 · 卢沟桥战事",
    kind: "image2video",
    accepted: true,
    prompt: "固定横向构图，镜头只做极慢推近，绝不旋转、俯仰或环绕。严格保持原图20世纪50至60年代中国连环画墨线、交叉排线、旧纸纹与低饱和土黄灰蓝，不变成写实电影、3D、动漫或高饱和数字火焰。1937年卢沟桥夜战，日军炮击远处城墙，中国守军在沙袋后抵抗；只允许克制的暗光炮闪、烟尘和人物轻微动作，火光不得吞没画面。禁止现代武器、现代建筑、文字、水印、变脸、多肢。无音频。",
  },
  "1b574640-884c-478b-821d-d7d12d980583": {
    label: "镜头03 · 沦陷与难民",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图和人物造型基准。保持20世纪50至60年代中国连环画的手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐；画面克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不增人、不多肢。禁止任何字幕、文字、数字、旗帜文字、UI、水印、现代建筑、现代车辆和现代器物。无音频。 固定宽幅构图，仅作极缓慢向右平移。前景背着破包袱、抱着孩子的难民缓慢向左走，步伐疲惫；中景铁路旁的日军巡逻队向相反方向行进，远处蒸汽机车黑烟和县城烟柱缓慢飘动。不得出现战旗、文字或新爆炸。",
  },
  "5afd923d-3031-46d5-9d00-7075d35af103": {
    label: "镜头04 · 敌后组织",
    kind: "image2video",
    accepted: true,
    prompt: "固定中景构图，镜头只做极慢横移，绝不旋转、俯仰或环绕。严格保持原图20世纪50至60年代中国连环画墨线、交叉排线、旧纸纹与低饱和土黄灰蓝。少量装备简陋的八路军干部和村民、民兵围着无字粗糙地图商议，老人指向地图，其他人轻微点头和交换目光；手、脸、地图线条必须稳定。禁止大军接管感、现代服装家具、可读文字、水印、变脸、多肢。无音频。",
  },
  "687459d3-4bde-45bb-94ad-adb3bb5fe00a": {
    label: "镜头05 · 敌占村庄",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图和人物造型基准。保持20世纪50至60年代中国连环画的手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐；画面克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不增人、不多肢。禁止任何字幕、文字、数字、旗帜文字、UI、水印、现代建筑、现代车辆和现代器物。无音频。 镜头从村口极缓慢推近，保持破败贫困的敌占区村庄原貌。远处据点炮楼哨兵只是模糊剪影，卡口木障和封锁沟不移动；两名衣衫破旧的村民牵着被日伪征用的瘦驴缓慢经过，风卷少量尘土，枯枝轻动。不得把村庄变富、不得新增车辆牲口或现代设施。",
  },
  "8c206c4c-b5e1-460e-9db2-ca3a144ba200": {
    label: "镜头06 · 梁家贫困",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图和人物造型基准。保持20世纪50至60年代中国连环画的手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐；画面克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不增人、不多肢。禁止任何字幕、文字、数字、旗帜文字、UI、水印、现代建筑、现代车辆和现代器物。无音频。 固定室内构图，极缓慢推近梁家贫寒土屋。土炕上的破被、墙上旧锯刨、缺口瓦罐和小木凳都保持原位；油灯火苗轻轻摇晃，窗缝冷风使一角破布微动。屋内无人，不得凭空增加粮食、家具、牲口或现代物件。",
  },
  "33787a08-b58a-41c0-844f-c968c17577aa": {
    label: "镜头07 · 农民与木工手艺",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图和人物造型基准。保持20世纪50至60年代中国连环画的手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐；画面克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不增人、不多肢。禁止任何字幕、文字、数字、旗帜文字、UI、水印、现代建筑、现代车辆和现代器物。无音频。 保持原图左右并置的连环画双场景，不切换布局。左侧梁父作为贫苦农民弯腰挥锄，动作沉重缓慢；右侧同一位梁父农闲蹲坐修犁把，手锯轻拉，少量木屑落下，邻人递来一小捧粗粮。两边人物身份和脸型一致，不新增钱币、工资、牲口或富足物品。",
  },
  "7a386c29-fca5-4a62-81b8-cd104b9d2826": {
    label: "镜头08 · 补衣与留种",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图和人物造型基准。保持20世纪50至60年代中国连环画的手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐；画面克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不增人、不多肢。禁止任何字幕、文字、数字、旗帜文字、UI、水印、现代建筑、现代车辆和现代器物。无音频。 固定梁家室内近景。母亲低头从旧褂上拆下一块尚结实的布，缓慢给裤膝缝补；十五岁的柱子沉默看着空碗，小妹妹双手捧着缺口粗陶碗。三人神情疲惫克制，只有针线、呼吸和灯影轻微运动。碗里保持空或只有极少残屑，不得增加食物、钱币、漂亮新衣或头巾。",
  },
  "44ea9dc2-6801-4b74-a642-355a35b27956": {
    label: "镜头09A · 抓夫",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图与人物造型基准。固定机位，不推近、不拉远、不旋转、不环绕、不切换场景。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。只有人物和尘土做极小幅自然动作；绝不转成写实摄影、3D、动漫或光滑数字插画。人物不变脸、不增人、不多肢。禁止字幕、文字、数字、乱码、UI、水印、钱币、现代物件。无音频。 日伪士兵按名册点名后粗暴抓走中间的梁父，一名士兵扭住他的手臂并向据点方向推搡；梁母被推倒在地，十五岁柱子在旁惊惧想扶她，小妹妹不在危险位置。梁父始终是活着的中年贫苦农民。暴力克制，不喷血、不枪决、不伤害孩子。绝对不得出现工钱、工资、结算、讨薪、纸钞或领奖。",
  },
  "19245d02-68d6-45f9-b9d4-0b8815c40180": {
    label: "镜头09B · 据点劳役",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图与人物造型基准。固定机位，不推近、不拉远、不旋转、不环绕、不切换场景。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。只有人物和尘土做极小幅自然动作；绝不转成写实摄影、3D、动漫或光滑数字插画。人物不变脸、不增人、不多肢。禁止字幕、文字、数字、乱码、UI、水印、钱币、现代物件。无音频。 据点劳役工地里，梁父和其他被抓民夫被迫扛木料、锯木、搬石，动作迟缓疲惫；守卫端枪监视，用枪托推搡梁父催工。不得把民夫画成士兵。暴力克制，不喷血、不出现尸体。绝对不得出现工钱、工资、结算、讨薪、钱币、纸钞或领奖。",
  },
  "37c490ab-cf64-4ddf-81a7-28ec569d502f": {
    label: "镜头09C · 第七天架回",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图与人物造型基准。固定机位，不推近、不拉远、不旋转、不环绕、不切换场景。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。只有人物和尘土做极小幅自然动作；绝不转成写实摄影、3D、动漫或光滑数字插画。人物不变脸、不增人、不多肢。禁止字幕、文字、数字、乱码、UI、水印、钱币、现代物件。无音频。 第七天村口，同一名受伤梁父已经走不了路，两名同村乡亲一左一右架着他慢慢向梁家门口挪步；梁母蹲下接应，十五岁柱子和小妹妹站在破门内惊惧等候。梁父双臂与额头的旧伤保持克制且连续，不得变成尸体、送葬或血泊。绝对不得出现工钱、工资、结算、讨薪、钱币、纸钞或领奖。",
  },
  "70b7c9a5-83d3-4ad8-83d8-fdd1df5aa8fa": {
    label: "镜头10A · 父子接锄",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图与人物造型基准。固定机位，不推近、不拉远、不旋转、不环绕、不切换场景。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。只有人物和尘土做极小幅自然动作；绝不转成写实摄影、3D、动漫或光滑数字插画。人物不变脸、不增人、不多肢。禁止字幕、文字、数字、乱码、UI、水印、钱币、现代物件。无音频。 梁家土屋里，受伤梁父坐在土炕边，双手缠旧布、握不住农具；十五岁柱子沉默地从父亲身旁接过旧锄，轻轻收紧手指，准备替父亲下地。父子神情沉重克制，破被和墙面保持原位。",
  },
  "af90313e-f69a-4c93-98fd-c1894aed96b0": {
    label: "镜头10B · 母亲与妹妹",
    kind: "image2video",
    accepted: true,
    prompt: "严格以输入参考图为唯一画面、构图与人物造型基准。固定机位，不推近、不拉远、不旋转、不环绕、不切换场景。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。只有人物和尘土做极小幅自然动作；绝不转成写实摄影、3D、动漫或光滑数字插画。人物不变脸、不增人、不多肢。禁止字幕、文字、数字、乱码、UI、水印、钱币、现代物件。无音频。 同一间梁家土屋，母亲低头继续缝补破衣，年幼妹妹双手捧着几乎空的缺口粗陶碗，担忧地朝父亲所在方向看一眼。只有针线、呼吸和昏暗灯影微动，不新增食物、家具或新衣。",
  },
  "5acd521b-e9c9-46a4-bcbb-5ca1b8c4f40c": {
    label: "镜头11 · 修正四口之家首帧",
    kind: "image",
    accepted: true,
    prompt: "制作序章镜头11的16比9首帧。第一张图是主要构图与画风依据，第二、三张只用于核对梁家人物身份。保留20世纪50至60年代中国连环画墨线、交叉排线、泛黄旧纸纹和低饱和土黄灰蓝。画面中央必须清清楚楚并排出现梁家四口，正好四名平民、一个不少：受伤且双手缠旧布的中年父亲、衣衫补丁的母亲、十五岁瘦削少年柱子、年幼小妹妹；四人从头到脚可辨，神情惊惧克制。两侧日伪士兵按册点户并翻找粮食，一人倾倒粗陶粮罐，但不伤害孩子。严禁遗漏任何家庭成员，严禁把母亲或柱子画成日军，严禁增加第五名家人，严禁文字、数字、名册可读文字、钱币、现代物件、血腥。",
  },
  "1023800e-b3f4-4671-8e65-c46cdb13b9d3": {
    label: "镜头11 · 点户到旧地窖",
    kind: "frames2video",
    accepted: true,
    prompt: "严格以首尾参考图为唯一画面和人物造型基准，保持20世纪50至60年代中国连环画手绘套色：墨线、交叉排线、泛黄旧纸纹、低饱和土黄灰蓝暗褐。前六秒保持梁家院落，梁家四口必须始终清楚完整，一个不少：双手缠旧布的受伤父亲、母亲、十五岁柱子、年幼妹妹；他们并排站在地面接受日伪按册点户，另一名士兵粗暴倾倒粮罐搜粮。不得伤害孩子。随后镜头从四人脚下缓慢下移，穿过厚土剖面，四人自然离开画面而不是变形，最终落入梁家旧地窖：空、暗、无人、无灯、只有一个狭窄入口、没有第二出口。不得把地窖变成宽敞地道，不得新增支洞、梯子网络、粮食堆或人物。画风全程一致，不得写实、3D、动漫；人物不变脸不多肢。禁止字幕、可读文字、数字、乱码、UI、水印、钱币、现代物件。无音频。",
  },
  "d131b071-23de-4e36-8c80-5e88ecd8769e": {
    label: "废弃 · 抓夫到劳役连续变形版",
    kind: "frames2video",
    accepted: false,
    rejectionReason: "首尾帧长插值造成模糊、人物变脸与光滑动画风。",
    prompt: "严格以首尾参考图为唯一画面和人物造型基准。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐，克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不多肢。禁止字幕、文字、数字、UI、水印、现代物件。无音频。 叙事必须清楚：日伪按名册抓走会木工的梁父，粗暴推搡到据点劳役工地；梁父被迫扛木料、锯木，动作迟缓时守卫用枪托和棍棒殴打威吓。梁父始终是同一名中年贫苦农民。暴力写实克制，不展示喷血、断肢或尸体。绝对不得出现钱币、工资、工钱、结算、讨薪、纸钞或领奖。",
  },
  "e66b2b6c-26fd-4c7e-af27-7c6c62d2c459": {
    label: "废弃 · 劳役到架回连续变形版",
    kind: "frames2video",
    accepted: false,
    rejectionReason: "跨地点连续变形，人物和画风不稳定。",
    prompt: "严格以首尾参考图为唯一画面和人物造型基准。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐，克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不多肢。禁止字幕、文字、数字、UI、水印、现代物件。无音频。 从据点劳役工地过渡到第七天的梁家村口：同一名梁父因长期强迫劳动和殴打已经站不稳，双臂与额头带有克制的旧伤，两名同村乡亲一左一右架着他缓慢回家；妻子、十五岁柱子和小妹妹在破门口惊惧迎接。不得把梁父画成尸体，不得新增送葬、血泊或枪决。绝对不得出现钱币、工资、工钱、结算、讨薪、纸钞或领奖。",
  },
  "1df0f453-1a67-4a71-a9cb-a44c74f5911c": {
    label: "废弃 · 父子到母女连续变形版",
    kind: "frames2video",
    accepted: false,
    rejectionReason: "同屋跨构图插值造成人物变脸与画面变软。",
    prompt: "严格以首尾参考图为唯一画面和人物造型基准。保持20世纪50至60年代中国连环画手绘套色质感：清晰墨线、交叉排线、泛黄旧纸纹，低饱和土黄、灰蓝、暗褐，克制沉重。不得转成写实电影、摄影、3D、动漫或高饱和数字插画。人物脸型、衣服、肢体数量稳定，不变脸、不多肢。禁止字幕、文字、数字、UI、水印、现代物件。无音频。 梁家土屋内的连续蒙太奇。先保持受伤的梁父坐在土炕边，双手缠着旧布、握不住农具；十五岁的柱子接过旧锄，神情沉重，轻轻转身准备下地。随后自然过渡到母亲继续缝补破衣，小妹妹捧着几乎空的粗陶碗，门外天色灰暗。四人衣着、屋内土炕和墙面保持一致，不新增粮食、钱币或现代器具。",
  },
});

export const SourceTasks = Object.freeze(Object.fromEntries(
  Object.entries(SourceTaskRecords).map(([submitId, task]) => [submitId, Object.freeze({
    ...task,
    submitId,
    provider: "Dreamina",
    status: "success",
    disposition: task.accepted ? "adopted-source" : "quality-rejected",
  })]),
));

export const VideoGroups = Object.freeze([
  { id: "01", title: "侵略推进", narration: "九一八事变后，日本占领东北，又不断把侵略推进华北。" },
  { id: "02", title: "卢沟桥战事", narration: "1937年7月，日军在卢沟桥挑起战事，随后进攻北平、天津，全面侵华战争爆发。" },
  { id: "03", title: "华北沦陷", narration: "此后一年，华北多数县城和铁路沿线相继沦陷，部分正规军向南、向西转进。" },
  { id: "04", title: "深入敌后", narration: "在许多失去常驻守军的乡村，八路军深入敌后，发动群众，坚持抗战。" },
  { id: "05", title: "梁家村", narration: "梁家村就在这样的敌占区。村外有据点、卡口和封锁沟；日伪强征粮食、摊派民夫，扫荡时还直接进村抢粮。" },
  { id: "06", title: "四口之家", narration: "柱子家四口，靠三四亩薄田、换工和农闲杂活过日子。家里没有牲口和车，耕牛、农具都得向邻里借。" },
  { id: "07", title: "梁木匠", narration: "乡亲叫柱子爹“梁木匠”，可地里的活才是他的本分。农闲时，他背着锯刨给人换犁把、修门轴，收几把粮。" },
  { id: "08", title: "粮已见底", narration: "娘把已经不能穿的旧褂拆开，挑尚结实的布补裤膝和袖肘。能下锅的粮已经见底，留种的小布包却单独封在瓦罐里，谁也不能动。" },
  { id: "09", title: "抓夫与劳役", narration: "因为会木工，柱子爹被点名抓走，关在据点工地。白天扛料锯木，干慢了挨打，夜里也不准回村。第七天，他走不了路，被两名乡亲架回家。" },
  { id: "10", title: "柱子分担", narration: "柱子十五岁。爹的手还握不住锄头，他得分担农活、照看妹妹，也得保住最后一点粮。" },
  { id: "11", title: "旧地窖只有一个口", narration: "日伪按册点户，也进屋搜粮；少一个人就可能被盘问。可梁家的旧地窖只有一个口。" },
]);

export const NarrationAssets = Object.freeze([
  { groupId: "01", id: "1xyxqc6", assetId: "AUD.PRO.01.NARRATION", file: "../Audio/Voice/1xyxqc6.mp3", duration: 5.06 },
  { groupId: "02", id: "0fprku0", assetId: "AUD.PRO.02.NARRATION", file: "../Audio/Voice/0fprku0.mp3", duration: 7.5 },
  { groupId: "03", id: "05w5rcf", assetId: "AUD.PRO.03.NARRATION", file: "../Audio/Voice/05w5rcf.mp3", duration: 7.5 },
  { groupId: "04", id: "09nrvy8", assetId: "AUD.PRO.04.NARRATION", file: "../Audio/Voice/09nrvy8.mp3", duration: 6.5 },
  { groupId: "05", id: "119t85p", assetId: "AUD.PRO.05.NARRATION", file: "../Audio/Voice/119t85p.mp3", duration: 11.2 },
  { groupId: "06", id: "0nv8258", assetId: "AUD.PRO.06.NARRATION", file: "../Audio/Voice/0nv8258.mp3", duration: 10.16 },
  { groupId: "07", id: "0kmn2ej", assetId: "AUD.PRO.07.NARRATION", file: "../Audio/Voice/0kmn2ej.mp3", duration: 10.07 },
  { groupId: "08", id: "1s0d8tg", assetId: "AUD.PRO.08.NARRATION", file: "../Audio/Voice/1s0d8tg.mp3", duration: 12.34 },
  { groupId: "09", id: "02zk5nh", assetId: "AUD.PRO.09.NARRATION", file: "../Audio/Voice/02zk5nh.mp3", duration: 13.3 },
  { groupId: "10", id: "0qnfpb6", assetId: "AUD.PRO.10.NARRATION", file: "../Audio/Voice/0qnfpb6.mp3", duration: 7.5 },
  { groupId: "11", id: "0wrgytz", assetId: "AUD.PRO.11.NARRATION", file: "../Audio/Voice/0wrgytz.mp3", duration: 7.31 },
].map((asset) => Object.freeze({
  ...asset,
  type: "audio",
  version: "v1",
  currentVersionId: "v1",
  engine: "Qwen3-TTS",
  release: "20260805Qwen3",
  voice: "Narrator",
  sampleRate: 24000,
  bitrateKbps: 48,
  versions: Object.freeze([Object.freeze({
    id: "v1",
    file: asset.file,
    createdAt: "2026-08-05",
    provider: "Qwen3-TTS",
    recipeId: asset.id,
    voice: "Narrator",
    duration: asset.duration,
    sampleRate: 24000,
    bitrateKbps: 48,
  })]),
})));

const Node = (id, groupId, title, duration, sourceTaskId, referenceFiles, actionPrompt, transitionType = "cut", transitionDuration = 0, command = "image2video") => ({
  id,
  chapterId: BoardMeta.chapterId,
  sceneId: `SCENE.PRO.${groupId}`,
  shotId: `SHOT.PRO.${id.slice(3).toUpperCase()}`,
  assetId: `VID.PRO.${id.slice(3).toUpperCase()}`,
  promptAssetId: `PRM.PRO.${id.slice(3).toUpperCase()}`,
  type: "video",
  version: "v1",
  groupId,
  title,
  duration,
  generationDuration: Math.max(4, Math.ceil(duration)),
  sourceTaskId,
  command,
  model: "seedance2.0_vip",
  resolution: "720p",
  referenceFiles,
  clip: `./Animation/Animation_Pro${id.slice(3).toUpperCase()}.mp4`,
  poster: `./Texture/Texture_PosterPro${id.slice(3).toUpperCase()}.jpg`,
  status: "legacy-split",
  actionPrompt,
  transitionOut: { type: transitionType, duration: transitionDuration },
});

export const VideoNodes = Object.freeze([
  Node("pro01a", "01", "东北沦陷：地图定场", 3, "1090a762-962e-42e0-a8c4-e2146ac52226", ["Texture_ReferencePro01.png"], "固定正俯视的无字旧地图。只让旧纸纹和墨线做几乎不可察觉的呼吸，先不出现箭头。"),
  Node("pro01b", "01", "侵略箭头推进华北", 4, "1090a762-962e-42e0-a8c4-e2146ac52226", ["Texture_ReferencePro01.png"], "机位仍然完全固定。三道暗红侵略箭头依次从东北向华北缓慢延伸；地图边界绝不漂移。", "fade-black", 0.35),
  Node("pro02a", "02", "卢沟桥炮火", 4, "965885ec-da6e-437d-8d27-25a5e9a86f85", ["Texture_ReferencePro02.png"], "固定夜战远景。日军炮击只出现一次克制暗光炮闪，烟尘向一侧缓慢散开；不移动机位。"),
  Node("pro02b", "02", "守军在沙袋后抵抗", 4, "965885ec-da6e-437d-8d27-25a5e9a86f85", ["Texture_ReferencePro02.png"], "固定中远景。中国守军在沙袋后压低身体抵抗，人物只做一次换位和举枪动作；火光不得吞没画面。"),
  Node("pro03a", "03", "县城与铁路失守", 3, "1b574640-884c-478b-821d-d7d12d980583", ["Texture_ReferencePro03.png"], "固定宽幅构图。远处县城烟柱与蒸汽机车黑烟缓慢飘动，铁路沿线的压迫感来自纵深，不靠镜头移动。"),
  Node("pro03b", "03", "铁路旁的日军巡逻", 3, "1b574640-884c-478b-821d-d7d12d980583", ["Texture_ReferencePro03.png"], "固定铁路侧景。日军巡逻队从画面中部缓慢通过，队形和人数稳定；无旗帜文字、无新爆炸。"),
  Node("pro03c", "03", "难民背井离乡", 2, "1b574640-884c-478b-821d-d7d12d980583", ["Texture_ReferencePro03.png"], "固定前景。背破包袱和抱孩子的难民疲惫走过画面，人物从边缘自然离开，不用跟拍。", "dissolve", 0.45),
  Node("pro04a", "04", "简陋地图前围坐", 3, "5afd923d-3031-46d5-9d00-7075d35af103", ["Texture_ReferencePro04.png"], "固定中景。少量装备简陋的八路军干部、村民和民兵围着无字粗糙地图坐定，先以沉默和目光建立关系。"),
  Node("pro04b", "04", "干部与群众商议", 4, "5afd923d-3031-46d5-9d00-7075d35af103", ["Texture_ReferencePro04.png"], "同一固定机位。老人指向无字地图，一名干部点头，其他人交换目光；手、脸和地图线条必须稳定。"),
  Node("pro05a", "05", "封锁沟压住村口", 4, "687459d3-4bde-45bb-94ad-adb3bb5fe00a", ["Texture_ReferencePro05.png"], "固定村口远景。封锁沟、卡口木障和远处据点形成三层纵深；只让枯枝和少量尘土轻动。"),
  Node("pro05b", "05", "卡口盘查", 4, "687459d3-4bde-45bb-94ad-adb3bb5fe00a", ["Texture_ReferencePro05.png"], "固定卡口侧景。日伪哨兵粗暴拦下衣衫破旧的村民翻看包袱；炮楼哨兵只保留模糊剪影。"),
  Node("pro05c", "05", "牲口被征用", 5, "687459d3-4bde-45bb-94ad-adb3bb5fe00a", ["Texture_ReferencePro05.png"], "固定村道中景。两名村民牵着被征用的瘦驴缓慢经过，神情麻木；不得把村庄画富，不新增车辆牲口。", "cut", 0),
  Node("pro06a", "06", "三四亩薄田", 4, "8c206c4c-b5e1-460e-9db2-ca3a144ba200", ["Texture_ReferencePro06.png"], "固定薄田远景。梁家四口在贫瘠小块田地分散劳作，地里稀疏，人物动作迟缓；没有自家牲口和车。"),
  Node("pro06b", "06", "梁家空屋", 4, "8c206c4c-b5e1-460e-9db2-ca3a144ba200", ["Texture_ReferencePro06.png"], "固定梁家土屋内景。土炕破被、墙上旧锯刨、缺口瓦罐和小木凳保持原位；只让油灯和破布轻动。"),
  Node("pro06c", "06", "向邻里借农具", 5, "8c206c4c-b5e1-460e-9db2-ca3a144ba200", ["Texture_ReferencePro06.png"], "固定院门外中景。梁父从邻人手里接过一件旧农具，双方没有钱币交换；背景空屋和薄田保持贫困。", "fade-black", 0.35),
  Node("pro07a", "07", "地里的活才是本分", 7, "33787a08-b58a-41c0-844f-c968c17577aa", ["Texture_ReferencePro07.png"], "固定田间中景。梁父作为贫苦农民弯腰挥锄，动作沉重缓慢；不使用双场景，不移动机位。"),
  Node("pro07b", "07", "农闲木工换几把粮", 7, "33787a08-b58a-41c0-844f-c968c17577aa", ["Texture_ReferencePro07.png"], "固定院内中景。梁父蹲坐修犁把，手锯只来回一次，少量木屑落下；邻人递来一小捧粗粮，绝无工钱或工资。", "match-cut", 0),
  Node("pro08a", "08", "拆旧褂补裤膝", 7, "7a386c29-fca5-4a62-81b8-cd104b9d2826", ["Texture_ReferencePro08.png"], "固定室内近景。母亲从不能穿的旧褂上拆下一块尚结实的布，给裤膝缝补；只动针线、呼吸和灯影。"),
  Node("pro08b", "08", "粮见底，留种封存", 7, "7a386c29-fca5-4a62-81b8-cd104b9d2826", ["Texture_ReferencePro08.png"], "固定桌面与人物同框。空碗旁只有极少残屑，母亲把装留种的小布包放进瓦罐封好；不得增加食物、钱币或新衣。", "cut", 0),
  Node("pro09a", "09", "按名册抓走梁父", 6, "44ea9dc2-6801-4b74-a642-355a35b27956", ["Texture_ReferencePro09A.png"], "日伪按名册点名后粗暴抓走梁父，一名士兵扭住他的手臂推搡；梁母被推倒，柱子想扶她。固定机位，暴力克制，无枪决、无工钱。"),
  Node("pro09b", "09", "据点工地强迫劳役", 6, "19245d02-68d6-45f9-b9d4-0b8815c40180", ["Texture_ReferencePro09B.png"], "据点劳役工地，梁父和其他被抓民夫被迫扛木料、锯木、搬石；守卫用枪托推搡催工。固定机位，绝无工资结算。"),
  Node("pro09c", "09", "第七天被乡亲架回", 6, "37c490ab-cf64-4ddf-81a7-28ec569d502f", ["Texture_ReferencePro09C.png"], "第七天村口，两名乡亲一左一右架着已经走不了路的梁父缓慢回家；梁母蹲下接应，柱子和妹妹在破门内等候。", "fade-black", 0.45),
  Node("pro10a", "10", "柱子从爹手里接过锄", 4, "70b7c9a5-83d3-4ad8-83d8-fdd1df5aa8fa", ["Texture_ReferencePro10A.png"], "梁家土屋固定中景。受伤梁父双手缠旧布、握不住农具；十五岁柱子沉默接过旧锄，轻轻收紧手指。"),
  Node("pro10b", "10", "母亲缝补，妹妹捧空碗", 4, "af90313e-f69a-4c93-98fd-c1894aed96b0", ["Texture_ReferencePro10B.png"], "同一土屋另一个固定中景。母亲继续缝补破衣，年幼妹妹捧几乎空的缺口粗陶碗，担忧地朝父亲方向看一眼。", "fade-black", 0.35),
  Node("pro11a", "11", "四口按册点户", 4, "5acd521b-e9c9-46a4-bcbb-5ca1b8c4f40c", ["Texture_ReferencePro11FamilyCorrected.png"], "梁家院落固定全身中景。梁家四口正好四人并排接受点户：受伤父亲、母亲、十五岁柱子、年幼妹妹；士兵倾倒粮罐搜粮，不伤害孩子。", "vertical-down", 0.4),
  Node("pro11b", "11", "厚土之下的单口旧地窖", 6, "1023800e-b3f4-4671-8e65-c46cdb13b9d3", ["Texture_ReferencePro11FamilyCorrected.png", "Texture_ReferencePro11B.png"], "本节点唯一允许的运镜：从四人脚下匀速垂直下移，穿过厚土剖面，落到空、暗、无人、无灯、只有一个狭窄入口的旧地窖。绝不推近、旋转或横移。", "cut", 0, "frames2video"),
]);

const referenceUsage = new Map();
for (const node of VideoNodes) {
  for (const file of node.referenceFiles) {
    if (!referenceUsage.has(file)) referenceUsage.set(file, []);
    referenceUsage.get(file).push(node.id);
  }
}

function ReferenceAssetId(fileName) {
  const match = /^Texture_ReferencePro([0-9]{2})([A-Z])?\.png$/.exec(fileName);
  if (match) return `IMG.PRO.${match[1]}${match[2] || ""}.REFERENCE`;
  if (fileName === "Texture_ReferencePro11FamilyCorrected.png") return "IMG.PRO.11.FAMILY";
  throw new Error(`Reference image is missing a stable asset id: ${fileName}`);
}

export const ReferenceAssets = Object.freeze([...referenceUsage.entries()].map(([file, consumers]) => Object.freeze({
  id: ReferenceAssetId(file),
  type: "image",
  version: "v1",
  currentVersionId: "v1",
  file: `./Reference/${file}`,
  fileName: file,
  consumers: Object.freeze([...consumers]),
  status: file.includes("FamilyCorrected") ? "generated-corrected" : "legacy-reference",
  provenance: Object.freeze(file.includes("FamilyCorrected")
    ? { provider: "Dreamina", sourceTaskId: "5acd521b-e9c9-46a4-bcbb-5ca1b8c4f40c", status: "verified-task" }
    : { provider: null, sourceTaskId: null, status: "legacy-source-unregistered" }),
  versions: Object.freeze(file.includes("FamilyCorrected")
    ? [
        Object.freeze({ id: "v0", file: "./Reference/Texture_ReferencePro11A.png", status: "superseded", provenance: "legacy-source-unregistered" }),
        Object.freeze({ id: "v1", file: `./Reference/${file}`, status: "adopted", provenance: "5acd521b-e9c9-46a4-bcbb-5ca1b8c4f40c" }),
      ]
    : [Object.freeze({ id: "v1", file: `./Reference/${file}`, status: "adopted", provenance: "legacy-source-unregistered" })]),
  checksum: null,
})));

export const PromptAssets = Object.freeze(VideoNodes.map((node) => Object.freeze({
  id: node.promptAssetId,
  type: "prompt",
  currentVersionId: "v1",
  sourceTaskId: node.sourceTaskId,
  consumers: Object.freeze([node.assetId]),
  versions: Object.freeze([Object.freeze({
    id: "v1",
    createdAt: "source",
    provider: "working-recipe",
    prompt: `${StyleLockPrompt}\n\n${node.actionPrompt}`,
  })]),
})));

export const AssetTypeLabels = Object.freeze({
  shot: "镜头",
  image: "参考图片",
  video: "视频",
  audio: "旁白",
  prompt: "生成配方",
});

export const StoryHierarchy = Object.freeze({
  projectId: BoardMeta.projectId,
  title: "《地道里的光》",
  chapters: Object.freeze([Object.freeze({
    id: BoardMeta.chapterId,
    title: BoardMeta.chapterTitle,
    order: 1,
    scenes: Object.freeze(VideoGroups.map((group, index) => Object.freeze({
      id: `SCENE.PRO.${group.id}`,
      groupId: group.id,
      title: group.title,
      order: index + 1,
      narrationAssetId: NarrationAssets.find((asset) => asset.groupId === group.id)?.assetId,
      shotIds: Object.freeze(VideoNodes.filter((node) => node.groupId === group.id).map((node) => node.shotId)),
    }))),
  })]),
});

export const TransitionLabels = Object.freeze({
  cut: "硬切",
  dissolve: "交叉溶解",
  "fade-black": "淡黑",
  "vertical-down": "纵向下移",
  "match-cut": "动作匹配切",
});
