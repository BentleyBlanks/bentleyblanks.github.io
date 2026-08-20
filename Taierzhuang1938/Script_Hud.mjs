// 《血战台儿庄》HUD —— 纯 DOM/CSS，**不进 three 渲染**。
//
// 对标 Easy Red 2 的克制：ER2 的步兵武器**连弹药数都不显示**，准星默认关闭，
// 命中提示、穿透提示全是可选项。留下的只有：目标图标、小地图、当前是谁、
// 压制暗角、包扎提示。这里照这个尺度做。
//
// 唯一一处比 ER2 多的是「阵亡卡片」——全屏黑底白字打出刚才那个人的名字、籍贯、
// 生卒年。ER2 有这个设计，而在台儿庄它有额外的分量：
// 孙连仲的命令原话就是「士兵打完了，你自己填上去。你填过了，我来填」。

import { REINFORCE } from "./Data_Battle.mjs";

const NS = "http://www.w3.org/2000/svg";

/** 章节卡排在简报之后要等多久。0.55 s 让简报那 0.6 s 的淡出先走完。 */
const TITLE_AFTER_BRIEF_S = 0.55;

/**
 * 两个目标标签在纵向上至少要隔开多少像素（同时横向要近到 MARKER_SEP_X 才算撞）。
 * 一个 marker 是「▲ + 名字 + 进度条」三行，实测占 38 px 高。
 * 线性关卡里所有路标几乎在同一个方位角上 —— 实测第五关「十字街口 62m /
 * 西门里街 222m / 西门里 340m」三个标签打在同一像素上（x 762–838、y 449.5–465.8），
 * 两两重叠 1019–1103 px²，而且整关不散。投影点不做避让就必然叠成一坨。
 */
const MARKER_SEP_Y = 40;
const MARKER_SEP_X = 130;

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = {};
    this.minimapDirty = 0;
    this.Build();
    this.noteQueue = [];
    this.noteTimer = 0;
    this.subtitleTimer = 0;
    this.titleTimer = 0;
    this.hintTimer = 0;
    this.briefTimer = 0;
    this.deathTimer = 0;
    /** 等简报播完再浮出来的章节卡（见 Title）。 */
    this.pendingTitle = null;
    /** 说过的每一句纯文本。通关冒烟拿它断言剧本真的播了。 */
    this.spoken = [];
  }

  Build() {
    const mk = (cls, parent = this.root, tag = "div") => {
      const e = document.createElement(tag);
      e.className = cls;
      parent.appendChild(e);
      return e;
    };
    this.el.suppress = mk("hudSuppress");        // 压制暗角：纯 CSS 径向渐变，零成本
    this.el.damage = mk("hudDamage");
    this.el.top = mk("hudTop");
    this.el.phase = mk("hudPhase", this.el.top);
    this.el.objective = mk("hudObjective", this.el.top);
    this.el.identity = mk("hudIdentity");
    this.el.state = mk("hudState");
    this.el.subtitle = mk("hudSubtitle");
    this.el.hint = mk("hudHint");
    this.el.note = mk("hudNote");
    this.el.markers = mk("hudMarkers");
    this.el.minimap = mk("hudMinimap", this.root, "canvas");
    this.el.minimap.width = 190;
    this.el.minimap.height = 190;
    this.minimapCtx = this.el.minimap.getContext("2d");
    this.el.deathCard = mk("hudDeathCard");
    this.el.brief = mk("hudBrief");
    this.el.title = mk("hudTitle");
    this.el.epilogue = mk("hudEpilogue");
    this.el.cook = mk("hudCook");
  }

  /** 上方一行：阶段 / 日期 / 当前要打的点。 */
  SetPhase(phase) {
    this.el.phase.innerHTML = `<span class="d">${phase.date}</span><span class="l">${phase.label}</span>`;
  }

  SetObjective(text, ours, theirs) {
    // ER2 的信息不对称：站在占领区里才看得见对面还剩多少人
    const intel = theirs === null ? "" : `<span class="t">对面 ${theirs}</span>`;
    this.el.objective.innerHTML = `<span class="o">${text}</span>`
      + `<span class="p">${REINFORCE.poolLabel} ${ours}</span>${intel}`;
  }

  /** 玩家现在是谁。ER2 左上角只写当前班长是谁，这里写当前你是谁。 */
  SetIdentity(identity, weaponName) {
    this.el.identity.innerHTML =
      `<span class="n">${identity.name}</span>`
      + `<span class="o">${identity.origin}</span>`
      + `<span class="w">${weaponName}</span>`;
  }

  /** 姿态 / 伤口 / 绷带。**不显示弹药数** —— 自己数，或者听拉栓那一下。 */
  SetState({ stance, wounded, bleeding, bandages, breath, order,
    grenades = 0, bundles = 0, mortar = 0, cooking = 0 }) {
    const bits = [`<span class="s">${stance}</span>`];
    if (bleeding > 0) bits.push(`<span class="b">流血</span>`);
    else if (wounded) bits.push(`<span class="w">带伤</span>`);
    if (bandages > 0) bits.push(`<span class="g">绷带 ${bandages}</span>`);
    // 子弹数不显示（ER2 的步兵 HUD 也不显示），但手榴弹与集束是要计划的资源。
    // 台儿庄真正的主战兵器是手榴弹 —— 第 31 师一役用掉三十万余枚。
    if (grenades > 0) bits.push(`<span class="n">手榴弹 ${grenades}</span>`);
    if (bundles > 0) bits.push(`<span class="n">集束 ${bundles}</span>`);
    if (mortar > 0) bits.push(`<span class="m">迫击炮 ${mortar}</span>`);
    if (breath) bits.push(`<span class="h">屏息</span>`);
    if (order) bits.push(`<span class="c">${order}</span>`);
    this.el.state.innerHTML = bits.join("");
    // 蓄力条：攥着数几秒再扔，扔得远但引信也在烧。这一对取舍要看得见。
    this.el.cook.style.width = cooking > 0 ? `${Math.round(cooking * 120)}px` : "0";
    this.el.cook.classList.toggle("on", cooking > 0);
  }

  SetSuppression(v) {
    this.el.suppress.style.opacity = String(Math.min(1, v * 1.15));
  }

  SetDamage(v) {
    this.el.damage.style.opacity = String(Math.min(1, v));
  }

  Say(speaker, text, seconds = 3.6, variant = "") {
    this.el.subtitle.innerHTML = speaker
      ? `<span class="who">${speaker}</span><span class="txt">${text}</span>`
      : `<span class="txt narr">${text}</span>`;
    this.el.subtitle.className = `hudSubtitle on${variant ? " " + variant : ""}`;
    this.subtitleTimer = seconds;
    // 留一份纯文本给通关冒烟断言用 —— 靠解析 innerHTML 判断"台词有没有出现过"
    // 一改样式就会碎，而这条断言是剧本层唯一的回归保护。
    this.spoken.push(String(text));
    if (this.spoken.length > 400) this.spoken.shift();
  }

  /**
   * 章节卡：阶段开场那一行大字。
   *
   * 【2026-08-20 修「开场三层字叠在一起」】
   * 实测 1600×900 phase=0：简报可见窗 1.18—8.73 s，章节卡 2.63—7.31 s ——
   * **章节卡整个生命周期完全套在简报里面，重合 4.68 s，重合率 100%**，
   * 再加上一直在的目标指示器，开场固定有 4.7 秒三层文字互相压着。
   * 1280×720 上最糟：12 对墨迹重叠、7412 px²，「界 河」大字直接压在简报第二行上。
   * 1920×1080 之所以看着没事，是简报右边界离副标题只差 **7 px** ——
   * 版式里没有任何互斥保证，纯属侥幸。
   *
   * 因果上这本来就该是**顺序**关系：Script_Story.mjs:138 那行
   * `this.sinceLast = MIN_GAP;  // 开场不要立刻甩台词，让 brief 先说完`
   * 想要的就是这个，但它把闸门变量设成了闸门阈值本身，等于开场就把闸门打开，
   * 第一条 beat 0.8 s 就播 —— 注释想要的效果一次都没生效过。
   *
   * 这里不去动 Story 的节拍（那会改变每关播完多少条 beat，PlayTest 第 8 组在数），
   * 只把**显示**排到简报后面：beat 照常推进、sinceLast 照常清零，
   * 纯粹是这张卡片晚一点浮出来。0.55 s 的补偿是让简报那 0.6 s 的淡出先走完，
   * 不然两张卡会在低透明度上擦一下。
   */
  Title(text, sub = "") {
    this.spoken.push(String(text));
    if (this.briefTimer > 0) {
      this.pendingTitle = { text, sub, wait: this.briefTimer + TITLE_AFTER_BRIEF_S };
      return;
    }
    this._ShowTitle(text, sub);
  }

  _ShowTitle(text, sub) {
    this.el.title.innerHTML = `<div class="tMain">${text}</div>`
      + (sub ? `<div class="tSub">${sub}</div>` : "");
    this.el.title.classList.add("on");
    this.titleTimer = 4.2;
  }

  /** 尾声：一行一行浮出来，不打歼敌数。 */
  ShowEpilogue(lines) {
    this.el.epilogue.innerHTML = lines
      .map((l) => (l ? `<div class="eLine">${l}</div>` : `<div class="eGap"></div>`))
      .join("");
    this.el.epilogue.classList.add("on");
    for (const l of lines) if (l) this.spoken.push(String(l));
  }

  /**
   * 收掉尾声。从菜单重开一关时必须调 —— 不收的话新一关会顶着上一局的结算跑，
   * 而那一层是不透明的黑底（.hudEpilogue.on），玩家看到的是"进不去游戏"。
   */
  HideEpilogue() {
    this.el.epilogue.classList.remove("on");
  }

  Hint(text, seconds = 4.5) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add("on");
    this.hintTimer = seconds;
  }

  /** 史实注记卡片。排队弹，不叠在一起。 */
  Note(note) {
    this.noteQueue.push(note);
  }

  /**
   * 阵亡卡片。照 Easy Red 2 的呈现：黑底、居中、无装饰，
   * 姓名（大）-> 籍贯 · 生卒（小）-> 番号（更小更暗），期间不出任何别的 HUD。
   *
   * 为什么这张卡值得单独讲究：它是这个游戏唯一一处把"一条命"具体化的地方。
   * 姓名是中文的、籍贯是真地名（河北雄县、河南尉氏、陕西泾阳…按第 2 集团军的
   * 实际构成抽），生年由年龄反推 —— 十七到三十四岁，绝大多数活不到二十五。
   * 孙连仲那句命令的原话就是这个机制：「士兵打完了，你自己填上去。你填过了，我来填。」
   */
  ShowDeathCard(identity, unit, seconds) {
    const born = 1938 - identity.age;
    this.el.deathCard.innerHTML =
      `<div class="dcName">${identity.name}</div>`
      + `<div class="dcOrigin">籍贯　${identity.origin}</div>`
      + `<div class="dcYears">${born} — 1938</div>`
      + `<div class="dcUnit">${unit}</div>`;
    this.el.deathCard.classList.add("on");
    // 卡片在的时候把别的 HUD 全压掉 —— ER2 那一屏是干净的，
    // 旁边还挂着小地图和弹药提示就成了"死亡结算界面"，不是那个意思。
    this.root.classList.add("deathCardOn");
    this.deathTimer = seconds;
  }

  HideDeathCard() {
    this.el.deathCard.classList.remove("on");
    this.root.classList.remove("deathCardOn");
  }

  ShowBrief(phase) {
    this.el.brief.innerHTML = `<div class="bTitle">${phase.date}</div>`
      + phase.brief.map((l) => `<div class="bLine">${l}</div>`).join("");
    this.el.brief.classList.add("on");
    this.briefTimer = 6.5;
    // 换关了：上一关没来得及浮出来的章节卡就地作废，别飘到下一关去
    this.pendingTitle = null;
  }

  /** 屏幕空间的占领点图标。ER2：交叉刀剑＝待打，旗帜＝已占。 */
  UpdateMarkers(objectives, camera, project) {
    const box = this.el.markers;
    while (box.children.length < objectives.length) {
      const m = document.createElement("div");
      m.className = "hudMarker";
      m.innerHTML = `<span class="ico"></span><span class="nm"></span><span class="bar"><i></i></span>`;
      box.appendChild(m);
    }
    // 先把可见的都投影出来，再统一避让 —— 逐个直接写 left/top 是叠成一坨的根因。
    const placed = [];
    objectives.forEach((o, i) => {
      const el = box.children[i];
      const p = project(o.x, o.y ?? 1.6, o.z);
      if (!p.visible) { el.style.display = "none"; return; }
      el.style.display = "";
      el.className = `hudMarker ${o.owner === "nra" ? "ours" : o.contested ? "fight" : "theirs"}`;
      el.children[0].textContent = o.owner === "nra" ? "▲" : "✕";
      el.children[1].textContent = `${o.name} ${Math.round(p.dist)}m`;
      el.children[2].firstChild.style.width = `${Math.round(o.progress * 100)}%`;
      placed.push({ el, x: p.x, y: p.y, dist: p.dist });
    });

    // 纵向避让：近的先占位（它更要紧），远的往下挪，直到不再压着任何一个已放好的。
    // 只在横向也挨着（|dx| < MARKER_SEP_X）时才算撞 —— 屏幕两头的两个路标
    // 纵坐标一样也互不干扰，一刀切地往下推会把标签甩到画面外。
    placed.sort((a, b) => a.dist - b.dist);
    const done = [];
    for (const m of placed) {
      let guard = 0;
      let moved = true;
      while (moved && guard < 16) {
        moved = false;
        guard += 1;
        for (const d of done) {
          if (Math.abs(d.x - m.x) >= MARKER_SEP_X) continue;
          if (Math.abs(d.y - m.y) >= MARKER_SEP_Y) continue;
          m.y = d.y + MARKER_SEP_Y;
          moved = true;
        }
      }
      done.push(m);
      m.el.style.left = `${m.x}px`;
      m.el.style.top = `${m.y}px`;
    }
  }

  /** 小地图：200ms 重绘一次就够，不必每帧。 */
  UpdateMinimap(dt, { player, objectives, soldiers, bounds }) {
    this.minimapDirty += dt;
    if (this.minimapDirty < 0.2) return;
    this.minimapDirty = 0;
    const ctx = this.minimapCtx;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(14,13,11,0.72)";
    ctx.fillRect(0, 0, W, H);
    const span = 260;
    const toMap = (x, z) => [
      W / 2 + (x - player.position.x) / span * W,
      H / 2 + (z - player.position.z) / span * H,
    ];
    // 占领点
    for (const o of objectives) {
      const [mx, my] = toMap(o.x, o.z);
      ctx.beginPath();
      ctx.arc(mx, my, (o.radius / span) * W, 0, Math.PI * 2);
      ctx.strokeStyle = o.owner === "nra" ? "rgba(150,190,230,0.75)" : "rgba(210,110,90,0.75)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // 只画班组级的圆圈，不画个体敌人（ER2 的做法：敌方标记落在班组几何中心）
    let ex = 0, ez = 0, en = 0;
    for (const s of soldiers) {
      if (!s.alive) continue;
      if (s.side === "nra") {
        const [mx, my] = toMap(s.position.x, s.position.z);
        ctx.fillStyle = "rgba(160,200,240,0.85)";
        ctx.fillRect(mx - 1.2, my - 1.2, 2.4, 2.4);
      } else if (s.position.distanceTo(player.position) < 90) {
        ex += s.position.x; ez += s.position.z; en += 1;
      }
    }
    if (en > 0) {
      const [mx, my] = toMap(ex / en, ez / en);
      ctx.beginPath();
      ctx.arc(mx, my, 7 + en * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(214,96,70,0.8)";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 玩家：一个朝向三角
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = "#e8e0cc";
    ctx.fill();
    ctx.restore();
  }

  Update(dt) {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.el.subtitle.classList.remove("on");
    }
    if (this.titleTimer > 0) {
      this.titleTimer -= dt;
      if (this.titleTimer <= 0) this.el.title.classList.remove("on");
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove("on");
    }
    if (this.briefTimer > 0) {
      this.briefTimer -= dt;
      if (this.briefTimer <= 0) this.el.brief.classList.remove("on");
    }
    // 排在简报后面的章节卡（见 Title 的注释）
    if (this.pendingTitle) {
      this.pendingTitle.wait -= dt;
      if (this.pendingTitle.wait <= 0) {
        this._ShowTitle(this.pendingTitle.text, this.pendingTitle.sub);
        this.pendingTitle = null;
      }
    }
    // 开场演出在的时候把目标指示器压下去。指示器整关都在，唯独这十来秒不该
    // 跟大字抢同一条带子 —— 实测那一帧最糟的一条 40 px 高的带子里同时排着
    // 简报第三行、章节副标题、和两个「▲ + 名字 + 距离」，
    // 「界河南岸 50m」这行字中间被另一个 ▲ 直接钉穿。
    this.root.classList.toggle("staging", this.briefTimer > 0 || this.titleTimer > 0);
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.HideDeathCard();
    }
    // 注记排队
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) this.el.note.classList.remove("on");
    } else if (this.noteQueue.length) {
      const n = this.noteQueue.shift();
      this.el.note.innerHTML = `<div class="nTier">${n.tier}</div>`
        + `<div class="nTitle">${n.title}</div>`
        + `<div class="nBody">${n.body}</div>`;
      this.el.note.classList.add("on");
      this.noteTimer = 9.5;
    }
  }

  /**
   * 下令面板已经改成 Script_Wheel 的径向轮盘（按住 Tab 推鼠标选）。
   * 这里留一个空实现是为了让"命令面板归 HUD 管"这条契约还在 ——
   * 轮盘自己画自己的，HUD 只需要知道它现在是开着的（将来要压暗其余 UI 时从这儿改）。
   */
  SetOrdersVisible(on) {
    this.ordersOpen = !!on;
  }
}
