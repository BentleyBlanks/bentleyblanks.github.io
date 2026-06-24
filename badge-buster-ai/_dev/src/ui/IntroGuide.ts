// First-run onboarding (HTML overlay — §A.2 allows HTML for outer chrome).
// The phone's 操作系统 greets the new AI and explains the core loop: you are an
// AI assistant; your job is to sort the host's notifications and hand the good
// info over to him. Mess up and you feed him hallucinated junk.
const GUIDE_KEY = 'badge-buster-ai.guide.v2';

interface Page {
  text: string;
  tip?: string;
}

const PAGES: Page[] = [
  { text: '叮——检测到新设备接入。<br>你好，你就是公司新分配给<b>宿主</b>的 <b>AI 助手</b>吧？' },
  {
    text: '先说清楚：<b>你是 AI，不是员工</b>。<br>右上角那个小人，才是你的<b>宿主</b>——一个被红点淹没的<b style="color:#c0473e">普通员工</b>。',
    tip: '👤 你的活儿，是帮他把消息理清楚',
  },
  { text: '他每天收到一堆通知，根本看不过来。<br>你要做的，是<b>替他分拣信息</b>，再把有用的<b>转交</b>给他。' },
  {
    text: '看左边的手机，App 上冒出的<b style="color:#c0473e">红色角标</b>就是堆积的消息。',
    tip: '👉 点一下角标，信息卡会弹到桌面上',
  },
  {
    text: '把卡片<b>拖</b>进右边<b style="color:#b8860b">分拣台</b>对应的托盘：有效 / 无效 / 高危 / 隔离。每个托盘下面都写了该放什么。',
    tip: '🗂️ 分对托盘，才会整理成「算力」并转交宿主',
  },
  {
    text: '分对了，<b>宿主满意度</b>会上升（右上角的脸会笑）；<br>分错了，他会皱眉，满意度下降。<b>满意度越高，你产出的算力越多。</b>',
    tip: '🙂 时刻看宿主的表情，就知道信息有没有送对',
  },
  {
    text: '小心<b style="color:#dca33a">幻觉风险</b>（顶部那条）。桌上卡片堆越久它涨得越快。<br>它一高，卡片内容会被<b>篡改成假消息</b>——你一旦把假消息当真转交，就是在坑宿主。',
    tip: '🔎 拿不准的卡，先点一下「偷看」确认真假',
  },
  {
    text: '算力是你唯一的货币：<br><b>左下角·帮手商店</b>雇小帮手替你干活，<b>右下角·工作台升级</b>让你更快、更不容易出幻觉。',
    tip: '⚡ 越往后，越能躺着看小帮手自己运转',
  },
  { text: '好了，宿主的红点又堆了一地。<br>开始干活吧，新来的。' },
];

export class IntroGuide {
  private root?: HTMLDivElement;
  private idx = 0;

  static seen(): boolean {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      return false;
    }
  }

  /** small always-on button to replay the intro. */
  mountReplayButton() {
    const btn = document.createElement('button');
    btn.textContent = '❓ 引导';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '14px',
      top: '96px',
      zIndex: '20',
      padding: '6px 12px',
      fontSize: '12px',
      fontFamily: 'inherit',
      color: '#5b4a31',
      background: 'rgba(244,232,203,0.92)',
      border: '1.5px solid #c69a4c',
      borderRadius: '10px',
      cursor: 'pointer',
      boxShadow: '0 3px 10px rgba(40,24,8,0.3)',
    } as CSSStyleDeclaration);
    btn.addEventListener('pointerenter', () => (btn.style.color = '#33271a'));
    btn.addEventListener('pointerleave', () => (btn.style.color = '#5b4a31'));
    btn.addEventListener('click', () => this.show(true));
    document.body.appendChild(btn);
  }

  show(force = false) {
    if (this.root) return;
    if (!force && IntroGuide.seen()) return;
    this.idx = 0;
    this.build();
    this.render();
  }

  private build() {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '40',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      background: 'rgba(30,18,6,0.5)',
      backdropFilter: 'blur(2px)',
      fontFamily: '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    } as CSSStyleDeclaration);

    const panel = document.createElement('div');
    panel.id = 'guide-panel';
    Object.assign(panel.style, {
      width: 'min(640px, 92vw)',
      margin: '0 0 8vh',
      padding: '20px 22px 18px',
      borderRadius: '18px',
      background: 'linear-gradient(180deg,#fff6e3,#efdfb8)',
      border: '2px solid #c69a4c',
      boxShadow: '0 18px 60px rgba(30,18,6,0.55)',
      color: '#33271a',
    } as CSSStyleDeclaration);
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:38px;height:38px;border-radius:10px;background:#2c2f36;border:1.5px solid #c69a4c;display:flex;align-items:center;justify-content:center;font-size:20px">📱</div>
        <div>
          <div style="font-weight:800;font-size:14px;letter-spacing:1px">操作系统</div>
          <div style="font-size:11px;color:#8a734c">SYSTEM · 新员工引导</div>
        </div>
        <div id="guide-dots" style="margin-left:auto;display:flex;gap:5px"></div>
      </div>
      <div id="guide-text" style="font-size:15px;line-height:1.7;min-height:72px"></div>
      <div id="guide-tip" style="font-size:12px;color:#a9772a;margin-top:8px;min-height:18px;font-weight:600"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        <button id="guide-skip" style="background:none;border:none;color:#8a734c;font-size:12px;cursor:pointer;font-family:inherit">跳过引导</button>
        <button id="guide-next" style="padding:8px 22px;border-radius:10px;border:1.5px solid #a9772a;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;background:#e8932f;color:#3a2a12"></button>
      </div>`;
    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;

    panel.querySelector<HTMLButtonElement>('#guide-skip')!.addEventListener('click', () => this.finish());
    panel.querySelector<HTMLButtonElement>('#guide-next')!.addEventListener('click', () => this.next());
  }

  private render() {
    if (!this.root) return;
    const page = PAGES[this.idx];
    const textEl = this.root.querySelector<HTMLDivElement>('#guide-text')!;
    const tipEl = this.root.querySelector<HTMLDivElement>('#guide-tip')!;
    const nextEl = this.root.querySelector<HTMLButtonElement>('#guide-next')!;
    const dotsEl = this.root.querySelector<HTMLDivElement>('#guide-dots')!;
    textEl.innerHTML = page.text;
    textEl.style.animation = 'none';
    // restart a tiny fade each page
    void textEl.offsetWidth;
    textEl.style.transition = 'opacity .25s';
    textEl.style.opacity = '0';
    requestAnimationFrame(() => (textEl.style.opacity = '1'));
    tipEl.innerHTML = page.tip ?? '';
    nextEl.textContent = this.idx >= PAGES.length - 1 ? '开始处理 ▶' : '下一步';
    dotsEl.innerHTML = PAGES.map((_, i) =>
      `<span style="width:7px;height:7px;border-radius:50%;background:${i === this.idx ? '#e8932f' : '#d3bd92'}"></span>`,
    ).join('');
  }

  private next() {
    if (this.idx >= PAGES.length - 1) {
      this.finish();
      return;
    }
    this.idx++;
    this.render();
  }

  private finish() {
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* ignore */
    }
    this.root?.remove();
    this.root = undefined;
  }
}
