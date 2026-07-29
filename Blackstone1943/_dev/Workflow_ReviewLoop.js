export const meta = {
  name: 'blackstone-review-loop',
  description: 'Blackstone1943: 玩法/剧情/视觉/性能四条独立审查线反复游玩审片，未达 3A 标准就退回重做，循环迭代',
  phases: [
    { title: '审查', detail: '四个独立审查 agent 各自反复游玩/审片，按 3A 标准打分并给出必须整改项' },
    { title: '整改', detail: '按领域派发修复 agent，只改自己拥有的文件' },
    { title: '复检', detail: '回归验证：冒烟 + 无错启动 + 截图复核' },
  ],
}

// ↓↓↓ 只需要改这一行：换成你本地仓库（或 worktree）的绝对路径 ↓↓↓
const ROOT = process.env.BLACKSTONE_ROOT || 'C:/Users/Bentl/Documents/Program/bentleyblanks.github.io'
const DIR = `${ROOT}/Blackstone1943`
const SP = `${ROOT}/Blackstone1943/_dev`
const QA = `${SP}/Qa.mjs`

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'scores', 'blockers', 'improvements', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    summary: { type: 'string', description: '两三句话说清现在到底什么水准' },
    scores: {
      type: 'object',
      description: '每个维度 1-10 分，8 分是"现代 3A 及格线"',
      additionalProperties: { type: 'number' },
    },
    blockers: {
      type: 'array',
      description: '必须整改项，按严重度排序。达不到就是 FAIL。',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'ownerFile', 'why', 'fix', 'severity'],
        properties: {
          title: { type: 'string' },
          ownerFile: { type: 'string', description: '应由哪个文件的 owner 修' },
          why: { type: 'string', description: '为什么这是问题，引用你实际看到/玩到的证据' },
          fix: { type: 'string', description: '具体可执行的修改方案，不要空话' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
      },
    },
    improvements: {
      type: 'array',
      description: '能明显提升品质的主动提案（没人要求但应该做的）',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'ownerFile', 'fix'],
        properties: { title: { type: 'string' }, ownerFile: { type: 'string' }, fix: { type: 'string' } },
      },
    },
  },
}

const CTX = `
项目：《黑石峪 · 一九四三年冬》——Three.js 做的 1943 年华北敌后第三人称潜行动作冒险游戏，目标是《最后生还者》级别的沉浸感与情感张力。
代码目录：${DIR}/
必读：${DIR}/AGENTS.md（模块契约与文件所有权）、${SP}/Brief.md（制作纲领与历史伦理红线）

**怎么"玩"这个游戏**（无头 Chromium 探针，你必须真的跑，不许凭源码想象）：
\`node ${QA} --steps "<步骤>" --out ${SP}/shots/<你的目录>\`
步骤语法：\`wait:<ms>\` \`key:<键>:<按住ms>\` \`tap:<键>\` \`click:<选择器>\` \`move:<dx>:<dy>\`（转视角）\`shot:<名字>\` \`eval:<js>\`
例：\`--steps "wait:2500;shot:Title;click:#BeginButton;wait:3000;shot:Open;key:w:2000;shot:Walk;move:300:0;wait:500;shot:Look;tap:c;shot:Crouch;eval:window.__Blackstone.debug"\`
输出 JSON 含 consoleErrors / pageErrors / stats（window.__Blackstone.debug）。截图是 PNG，**用 Read 工具直接看**。
调试入口：\`window.__Blackstone\`（ctx、debug、跳章函数）——先 \`--steps "wait:2500;eval:console.log(JSON.stringify(Object.keys(window.__Blackstone||{})))"\` 摸清有什么可用。
`

const HARD_BAR = `
**评分标准**：8 分 = 现代 3A 及格线。任何维度 <8 一律 verdict=FAIL 并写出 blockers。
**不许放水**：你的价值在于挑刺。写"整体不错"是失职。每条 blocker 必须带你实际观察到的证据（截图里看到什么 / 玩到哪一步卡住 / 源码哪一行）。
**也要主动提案**：看到能明显提升品质但没人要求的东西，写进 improvements。
`

const round = (args && args.round) || 1
const previous = (args && args.previousBlockers) || ''

phase('审查')
const reviews = await parallel([
  () => agent(`${CTX}

# 你是【玩法审查 Agent】（第 ${round} 轮）——独立、常设、有一票否决权

你的职责是**反复游玩整个游戏**，从下面九个维度做严格审核，标准是现代 3A：
1. **战斗手感**：反馈是否有力、命中是否可读、武器是否有个性、是否有"后悔暴露自己"的紧张感
2. **潜行深度**：敌人是否可读可利用、玩家是否有多种解法（绕/引/藏/杀/跑）、失败是否是自己的错、被发现后的重整（reset loop）是否顺畅
3. **探索**：世界是否值得看、有没有可选路线与隐藏奖励、搜刮是否有取舍痛感、有没有"因为好奇而绕路"的动机
4. **任务设计**：目标是否清晰、引导是否靠环境而非箭头、有没有"重复三遍同一件事"的懒惰设计
5. **成长系统**：玩家能力/资源/理解的成长曲线是否成立（本作不做技能树，但必须有"我变强了/我更懂了"的进展感）
6. **关卡节奏**：紧张与松弛是否交替、有没有拖沓段落、三幕是否各有面貌、是否存在"走路两分钟什么都不发生"
7. **玩家选择**：有没有真正影响结果的选择、终局抉择是否两难而非明显优劣
8. **难度平衡**：是否可通关、是否有不公平死亡、三档难度是否真的改变体验
9. **整体乐趣**：抛开题材，这半小时值不值得玩

**必须真的玩**：至少跑 6 组不同的游玩路径（潜行通过 / 强攻 / 迷路乱走 / 资源全搜 / 故意被发现 / 三幕各一段），每组都截图并 Read。
${previous ? `\n**上一轮你提出的必须整改项**（复检它们是否真的改好了，没改好的重新列为 critical）：\n${previous}\n` : ''}
${HARD_BAR}`, { label: `review:gameplay:r${round}`, phase: '审查', schema: REVIEW_SCHEMA, effort: 'xhigh' }),

  () => agent(`${CTX}

# 你是【剧情审查 Agent】（第 ${round} 轮）——独立、常设、有一票否决权

你的职责是审查**剧情结构、人物塑造、对白、任务流程、环境叙事、情感表达、历史氛围**，标准极高：
1. **剧情结构**：三幕是否成立、有没有中段塌陷、终局是否有必然性而非硬转
2. **人物塑造**：沈铁与冯小满是否立得住？小满有没有**主体性**（她要什么、怕什么、什么时候违抗沈铁），还是只是个被护送的道具？沈铁的转变有没有可信的过程而非一句话交代
3. **对白**：读一遍 ${DIR}/Data_Story.mjs 的全部台词。凡是口号腔、说教、"我们一定会胜利"式空话、现代网感用语、翻译腔——一律列为 blocker 并给出改写示例。好台词应该具体、克制、带生活质感、有潜台词
4. **任务流程与叙事的咬合**：玩法动作是否在讲故事（搜刮=贫瘠、拉栓=珍惜子弹），还是玩法与剧情两张皮
5. **环境叙事**：废墟里的细节是否在无声讲述（谁住过这里、那天发生了什么）；信件/标语/课本是否有信息量而非填充
6. **情感表达**：三个"停下来说话"的时刻是否真的动人？有没有廉价煽情（配乐轰炸、直白哭喊）？留白够不够
7. **历史代入感**：1943 年冬华北敌后的质感——物资、称呼、方言词、生活细节、时代语汇是否可信；有无穿帮（后世词汇、错误常识）
8. **历史伦理红线**：侵略责任是否明确、有无猎奇苦难、平民苦难有无被当作奖励或计分、有无抗日神剧式超人桥段、敌兵是否被小丑化

**必须真的玩**：跑通三幕，逐段截图看字幕与过场，Read 之。同时通读 Data_Story.mjs 与 Script_Story.mjs 全文。
${previous ? `\n**上一轮你提出的必须整改项**（复检是否真的改好）：\n${previous}\n` : ''}
${HARD_BAR}
特别提醒：**套路化、人物单薄、对白生硬、情感不足、缺乏历史代入感——任何一条命中就是 FAIL，退回重做。**`, { label: `review:story:r${round}`, phase: '审查', schema: REVIEW_SCHEMA, effort: 'xhigh' }),

  () => agent(`${CTX}

# 你是【视觉审查 Agent】（第 ${round} 轮）——独立、常设

对照**高品质 3A 游戏**（《最后生还者2》《荒野大镖客2》《地狱之刃》的冬季/废墟场景）逐项审片：
1. **第一眼观感**：截图放在 3A 截图旁边会不会一眼露怯？具体差在哪（光比、层次、材质、构图、剪影、色彩）
2. **光照与大气**：是否有方向感与层次、雾与体积光是否可信、阴影质量、有无死黑与死白
3. **色彩**：冬日冷灰 + 唯一暖色（火光橙）的签名是否成立、有无脏色与塑料感、tone mapping 是否合适
4. **材质**：夯土/木/雪/石/铁锈是否可辨、有无"塑料方块"感、尺度是否可信
5. **角色**：轮廓可读性、比例、着装辨识度（我军/伪军/日军/孩子一眼分得清吗）、姿态是否有重量
6. **动画**：有没有滑步、僵直、穿模、脚不着地
7. **构图与地标**：每幕的"明信片时刻"是否成立、天际线是否有信息
8. **UI**：HUD 是否克制、字体层级、是否破坏沉浸、移动端布局
9. **特效**：飘雪/火/枪口焰/呵气/尘土是否有说服力

**方法**：至少 12 张不同机位/时段/章节的截图，逐张 Read 并写具体评语。用 \`--width 1920 --height 1080\` 出图。
${previous ? `\n**上一轮的必须整改项**（复检）：\n${previous}\n` : ''}
${HARD_BAR}`, { label: `review:visual:r${round}`, phase: '审查', schema: REVIEW_SCHEMA, effort: 'xhigh' }),

  () => agent(`${CTX}

# 你是【性能与工程质量审查 Agent】（第 ${round} 轮）

1. **渲染开销**：读 \`window.__Blackstone.debug\` 的 drawCalls / triangles / programs / textures / geometries；draw call 是否失控、有无重复材质、该实例化的有没有实例化
2. **CPU 帧预算**：各模块 Update 耗时分布（若没有埋点，要求加）；有无每帧 new 对象 / 每帧写 DOM / 每帧字符串拼接导致 GC 抖动
3. **内存与泄漏**：切章节时几何/材质/纹理是否 dispose；对象池是否复用；事件订阅是否解绑
4. **移动端**：DPR 上限、SetQuality('low') 是否真的降负载、触屏是否可玩、包体大小（vendor 除外）
5. **工程质量**：\`node --check\` 全过、\`node ${DIR}/Script_SmokeTest.mjs\` 全过、无 console 报错、无未捕获 Promise、无死代码与重复实现、循环 import、契约与实现是否漂移
6. **健壮性**：WebGL 上下文丢失、AudioContext 未授权、localStorage 不可用、窗口缩放、快速点击、暂停恢复——是否都不崩

${HARD_BAR}`, { label: `review:perf:r${round}`, phase: '审查', schema: REVIEW_SCHEMA, effort: 'high' }),
])

const valid = reviews.filter(Boolean)
const allBlockers = valid.flatMap((r) => r.blockers || [])
const allImprovements = valid.flatMap((r) => r.improvements || [])
const failing = valid.filter((r) => r.verdict === 'FAIL')
log(`第 ${round} 轮审查：${valid.length} 条审查线，FAIL ${failing.length} 条，必须整改 ${allBlockers.length} 项，主动提案 ${allImprovements.length} 项`)

if (allBlockers.length === 0 && allImprovements.length === 0) {
  return { round, verdicts: valid.map((r) => ({ v: r.verdict, s: r.scores, sum: r.summary })), blockers: [], done: true }
}

// 按 ownerFile 归组派发整改
const byOwner = {}
for (const b of [...allBlockers, ...allImprovements]) {
  const key = (b.ownerFile || 'Script_Boot.mjs').split('/').pop()
  ;(byOwner[key] ||= []).push(b)
}
const groups = Object.entries(byOwner).slice(0, 12)

phase('整改')
const fixes = await parallel(groups.map(([file, items]) => () => agent(`${CTX}

# 你是 \`${file}\` 的 owner，负责第 ${round} 轮整改

四条独立审查线（玩法/剧情/视觉/性能）判定下面这些问题必须由你这个文件解决。**逐条落实，不许敷衍，不许只改注释。**

${items.map((b, i) => `## ${i + 1}. [${b.severity || 'improvement'}] ${b.title}\n**问题**：${b.why || '（主动提案）'}\n**要求的改法**：${b.fix}`).join('\n\n')}

规则：
- **只改 ${DIR}/${file}**（以及该 owner 明确拥有的配套文件，例如剧情 owner 同时拥有 Data_Story.mjs 与 Script_Story.mjs）。别的模块要配合，就走事件总线并把需求写进 ${DIR}/AGENTS.md 的「跨模块需求」。
- 改法可以比审查意见更好——你是这个领域的负责人。如果某条意见你判断是错的，**必须给出有证据的反驳**（跑一次探针拿证据），不能沉默跳过。
- 顺手把你自己看到的、能明显提升品质的东西一起做了（授权主动优化）。
- 自检：\`node --check\` + \`node ${DIR}/Script_SmokeTest.mjs\` + QA 探针跑通且 pageErrors 为空 + Read 截图确认。

返回：逐条"改了什么/在哪几行/怎么验证的"，以及你额外主动做的优化。`, { label: `fix:${file}:r${round}`, phase: '整改', effort: 'xhigh' })))

phase('复检')
const regression = await agent(`${CTX}

第 ${round} 轮整改刚完成（${groups.length} 个文件被修改）。你是**回归验证员**：

1. \`node --check\` 每个 .mjs；\`node ${DIR}/Script_SmokeTest.mjs\` 必须退出码 0。
2. QA 探针跑至少 4 组路径（标题→开局→潜行→交火→章节切换），\`pageErrors\` 与 \`consoleErrors\` **必须全空**。
3. Read 全部截图，确认没有整改引入的视觉/交互回归（黑屏、角色消失、HUD 错位、字幕重叠）。
4. 检查是否有 owner 越界改了别人的文件导致冲突或重复实现；有就合并修正。
5. 契约漂移核对：各模块实际 Emit/订阅的事件名 vs ${DIR}/AGENTS.md 事件表，对不上就修实现或补契约。
6. 把本轮所有变更要点追加到 ${DIR}/AGENTS.md 的变更记录小节。

修到全绿为止。返回：QA JSON 摘要 + 本轮仍未解决的问题（诚实列出）+ 你判断现在离 3A 标准还差什么。`, { label: `regress:r${round}`, effort: 'xhigh' })

return {
  round,
  verdicts: valid.map((r) => ({ label: r.summary, verdict: r.verdict, scores: r.scores })),
  blockers: allBlockers.map((b) => `[${b.severity}] ${b.ownerFile}: ${b.title} — ${b.fix}`),
  fixes,
  regression,
  done: failing.length === 0,
}
